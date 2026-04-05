import type { PluginInput } from "@opencode-ai/plugin";
import { log } from "../../shared/logger";

const MUTATION_PATTERNS = [
  "figma-daemon set ",
  "figma-daemon render",
  "figma-daemon node move",
  "figma-daemon node resize",
  "figma-daemon node delete",
  "figma-daemon node replace-with",
  "figma-daemon create ",
];

const VERIFICATION_PATTERNS = [
  "figma-daemon export node",
  "figma-daemon export screenshot",
];

interface MutationQAState {
  hasPendingMutation: boolean;
  lastMutatedNodeHint: string | undefined;
}

const sessionState = new Map<string, MutationQAState>();

const QA_REMINDER = `[POST-RENDER QA] You mutated the Figma canvas but haven't verified the result yet.

REQUIRED verification steps:
1. Export a screenshot: \`figma-daemon export node <nodeId> --output /tmp/after.png\`
2. Delegate to Vision Reviewer with before/after screenshots for visual check
3. Delegate to Design Auditor for token binding and lint check: \`figma-daemon lint --root <nodeId> -v\` and \`figma-daemon node bindings <nodeId>\`
4. After verification passes: reply to comment and resolve`;

export function clearMutationFlag(sessionId: string): void {
  const state = sessionState.get(sessionId);
  if (state) {
    state.hasPendingMutation = false;
    state.lastMutatedNodeHint = undefined;
  }
}

export function hasPendingMutation(sessionId: string): boolean {
  return sessionState.get(sessionId)?.hasPendingMutation ?? false;
}

export function createPostRenderQaHook(_ctx: PluginInput) {
  return {
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { result?: unknown; args: Record<string, unknown> },
    ): Promise<void> => {
      if (input.tool !== "bash") return;

      const command = output.args.command as string | undefined;
      if (!command) return;

      let state = sessionState.get(input.sessionID);
      if (!state) {
        state = { hasPendingMutation: false, lastMutatedNodeHint: undefined };
        sessionState.set(input.sessionID, state);
      }

      const isVerification = VERIFICATION_PATTERNS.some((p) =>
        command.includes(p),
      );
      if (isVerification) {
        state.hasPendingMutation = false;
        state.lastMutatedNodeHint = undefined;
        log(
          `[post-render-qa] verification detected, cleared pending mutation flag`,
          { sessionID: input.sessionID },
        );
        return;
      }

      const isMutation = MUTATION_PATTERNS.some((p) => command.includes(p));
      if (isMutation) {
        state.hasPendingMutation = true;
        const nodeMatch = command.match(/\b(\d+:\d+)\b/);
        state.lastMutatedNodeHint = nodeMatch?.[1];
        log(`[post-render-qa] mutation detected, QA pending`, {
          sessionID: input.sessionID,
          command: command.slice(0, 80),
          nodeHint: state.lastMutatedNodeHint,
        });
      }
    },

    "session.idle": async (
      input: { sessionID: string },
      output: { message?: string },
    ): Promise<void> => {
      const state = sessionState.get(input.sessionID);
      if (!state?.hasPendingMutation) return;

      log(
        `[post-render-qa] session idle with pending mutation, injecting QA reminder`,
        { sessionID: input.sessionID },
      );

      output.message = (output.message ?? "") + "\n\n" + QA_REMINDER;
    },
  };
}
