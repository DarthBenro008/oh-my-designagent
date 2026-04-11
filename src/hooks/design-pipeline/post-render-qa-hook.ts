import type { PluginInput } from "@opencode-ai/plugin";
import { log } from "../../shared/logger";
import {
  clearDesignIntentState,
  recordApprovedNodeIds,
  resolveDesignIntentState,
} from "./design-intent-state";

const NODE_ID_PATTERN = /\b(I?\d+:\d+(?:;\d+:\d+)*)\b/g;

const MUTATION_PATTERNS = [
  "figma-daemon set ",
  "figma-daemon render",
  "figma-daemon node move ",
  "figma-daemon node resize ",
  "figma-daemon node delete ",
  "figma-daemon node clone ",
  "figma-daemon node rename ",
  "figma-daemon node replace-with ",
  "figma-daemon create ",
  "figma-daemon import",
  "figma-daemon path ",
  "figma-daemon boolean ",
];

const VERIFICATION_PATTERNS = {
  exportNode: "figma-daemon export node",
  lint: "figma-daemon lint --root",
  bindings: "figma-daemon node bindings",
};

type MutationQAState = {
  hasPendingMutation: boolean;
  lastMutatedNodeHint: string | undefined;
  repliedThreadId: string | undefined;
  verification: {
    exportNode: boolean;
    lint: boolean;
    bindings: boolean;
  };
};

const sessionState = new Map<string, MutationQAState>();
const pendingCommands = new Map<string, string>();

const QA_REMINDER = `[POST-RENDER QA] You mutated the Figma canvas but haven't completed verification yet.

Required verification steps before replying:
1. Export a screenshot: \`figma-daemon export node <nodeId> --output /tmp/after.png\`
2. Run lint: \`figma-daemon lint --root <nodeId> -v\`
3. Check bindings: \`figma-daemon node bindings <nodeId>\``;

function makePendingKey(sessionID: string, callID: string): string {
  return `${sessionID}:${callID}`;
}

function includesPattern(command: string, pattern: string): boolean {
  return command.includes(pattern);
}

function includesAny(command: string, patterns: string[]): boolean {
  return patterns.some((pattern) => includesPattern(command, pattern));
}

function extractNodeIds(text: string | undefined): string[] {
  if (!text) {
    return [];
  }

  return [...text.matchAll(NODE_ID_PATTERN)]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));
}

function getOrCreateState(sessionID: string): MutationQAState {
  let state = sessionState.get(sessionID);
  if (!state) {
    state = {
      hasPendingMutation: false,
      lastMutatedNodeHint: undefined,
      repliedThreadId: undefined,
      verification: {
        exportNode: false,
        lint: false,
        bindings: false,
      },
    };
    sessionState.set(sessionID, state);
  }

  return state;
}

function hasCompletedVerification(state: MutationQAState): boolean {
  return state.verification.exportNode
    && state.verification.lint
    && state.verification.bindings;
}

function resetVerification(state: MutationQAState): void {
  state.verification.exportNode = false;
  state.verification.lint = false;
  state.verification.bindings = false;
}

function buildQaBlockMessage(state: MutationQAState): string {
  const missing = [
    state.verification.exportNode
      ? null
      : "`figma-daemon export node <nodeId> --output /tmp/after.png`",
    state.verification.lint
      ? null
      : "`figma-daemon lint --root <nodeId> -v`",
    state.verification.bindings
      ? null
      : "`figma-daemon node bindings <nodeId>`",
  ].filter(Boolean);

  return `${QA_REMINDER}\n\nMissing: ${missing.join(", ")}`;
}

function extractReplyTarget(command: string): string | undefined {
  const match = command.match(/--reply\s+([^\s]+)/i);
  return match?.[1]?.replace(/^["'`]|["'`]$/g, "");
}

function normalizeThreadId(value: string | undefined): string | undefined {
  return value?.trim().replace(/^["'`]|["'`]$/g, "");
}

export function clearMutationFlag(sessionId: string): void {
  const state = sessionState.get(sessionId);
  if (!state) {
    return;
  }

  state.hasPendingMutation = false;
  state.lastMutatedNodeHint = undefined;
  state.repliedThreadId = undefined;
  resetVerification(state);
}

export function hasPendingMutation(sessionId: string): boolean {
  return sessionState.get(sessionId)?.hasPendingMutation ?? false;
}

export function createPostRenderQaHook(ctx: PluginInput) {
  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown>; message?: string },
    ): Promise<void> => {
      if (input.tool !== "bash") {
        return;
      }

      const command = output.args.command;
      if (typeof command !== "string" || command.length === 0) {
        return;
      }

      pendingCommands.set(makePendingKey(input.sessionID, input.callID), command);

      const state = sessionState.get(input.sessionID);
      const normalized = command.toLowerCase();
      const designState = await resolveDesignIntentState(ctx, input.sessionID);
      const expectedThreadId = normalizeThreadId(designState.threadId);

      const replyTarget = normalizeThreadId(extractReplyTarget(command));
      const includesCommentAdd = normalized.includes("figma-daemon comment add");
      const includesCommentResolve = normalized.includes("figma-daemon comment resolve");

      if (expectedThreadId && includesCommentAdd) {
        if (!replyTarget) {
          throw new Error(
            `[THREAD-REPLY] Comment replies must use \`--reply ${expectedThreadId}\`. Without it, Figma creates a detached top-level comment.`,
          );
        }

        if (replyTarget !== expectedThreadId) {
          throw new Error(
            `[THREAD-REPLY] Comment reply targets the wrong thread. Expected \`${expectedThreadId}\`, received \`${replyTarget}\`.`,
          );
        }
      }

      if (
        includesCommentResolve
        && (designState.isDesignSession || expectedThreadId)
      ) {
        throw new Error(
          "[THREAD-REPLY] Solacy leaves Figma comments open for human review. Reply with `--reply <threadRootId>`; do not resolve.",
        );
      }

      if (!state?.hasPendingMutation) {
        return;
      }

      const includesRequiredVerification =
        includesPattern(normalized, VERIFICATION_PATTERNS.exportNode)
        && includesPattern(normalized, VERIFICATION_PATTERNS.lint)
        && includesPattern(normalized, VERIFICATION_PATTERNS.bindings);

      if (
        (normalized.includes("figma-daemon comment add")
          || normalized.includes("figma-daemon comment resolve"))
        && !includesRequiredVerification
        && !hasCompletedVerification(state)
      ) {
        throw new Error(buildQaBlockMessage(state));
      }
    },

    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { title: string; output: string; metadata: Record<string, unknown> },
    ): Promise<void> => {
      if (input.tool !== "bash") {
        return;
      }

      const pendingKey = makePendingKey(input.sessionID, input.callID);
      const command = pendingCommands.get(pendingKey);
      pendingCommands.delete(pendingKey);
      if (!command) {
        return;
      }

      const normalized = command.toLowerCase();
      const state = getOrCreateState(input.sessionID);
      const isMutation = includesAny(normalized, MUTATION_PATTERNS);

      if (isMutation) {
        state.hasPendingMutation = true;
        resetVerification(state);
        state.repliedThreadId = undefined;
        const commandIds = extractNodeIds(command);
        state.lastMutatedNodeHint = commandIds[0];

        const outputIds = extractNodeIds(output.output);
        const allIds = new Set<string>([...commandIds, ...outputIds]);
        recordApprovedNodeIds(input.sessionID, allIds, {
          variantClones: normalized.includes("figma-daemon node clone "),
        });

        log("[post-render-qa] mutation detected, verification required", {
          sessionID: input.sessionID,
          command: normalized.slice(0, 120),
          recordedIds: [...allIds],
        });
      }

      const designState = await resolveDesignIntentState(ctx, input.sessionID);
      const expectedThreadId = normalizeThreadId(designState.threadId);
      if (
        expectedThreadId
        && normalized.includes("figma-daemon comment add")
        && normalizeThreadId(extractReplyTarget(command)) === expectedThreadId
      ) {
        state.repliedThreadId = expectedThreadId;
      }

      if (includesPattern(normalized, VERIFICATION_PATTERNS.exportNode)) {
        state.verification.exportNode = true;
      }
      if (includesPattern(normalized, VERIFICATION_PATTERNS.lint)) {
        state.verification.lint = true;
      }
      if (includesPattern(normalized, VERIFICATION_PATTERNS.bindings)) {
        state.verification.bindings = true;
      }

      if (state.hasPendingMutation && hasCompletedVerification(state)) {
        state.hasPendingMutation = false;
        state.lastMutatedNodeHint = undefined;
        log("[post-render-qa] completed verification after mutation", {
          sessionID: input.sessionID,
        });
      }
    },

    event: async ({ event }: { event: { type: string; properties?: unknown } }) => {
      if (event.type !== "session.deleted") {
        return;
      }

      const properties = event.properties as { info?: { id?: string } } | undefined;
      const sessionID = properties?.info?.id;
      if (!sessionID) {
        return;
      }

      sessionState.delete(sessionID);
      clearDesignIntentState(sessionID);
    },
  };
}
