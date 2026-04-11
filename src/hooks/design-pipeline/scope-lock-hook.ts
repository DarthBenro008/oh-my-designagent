import type { PluginInput } from "@opencode-ai/plugin";
import { log } from "../../shared/logger";
import { isExecutableDesignPlanStatus } from "../../shared/design-plan";
import {
  clearDesignIntentState,
  resolveDesignIntentState,
} from "./design-intent-state";

const NODE_ID_PATTERN = /\b(I?\d+:\d+(?:;\d+:\d+)*)\b/g;

const CANVAS_MUTATION_PATTERNS = [
  "figma-daemon set ",
  "figma-daemon node move ",
  "figma-daemon node resize ",
  "figma-daemon node delete ",
  "figma-daemon node clone ",
  "figma-daemon node rename ",
  "figma-daemon node replace-with ",
  "figma-daemon diff apply",
  "figma-daemon render",
  "figma-daemon create ",
  "figma-daemon import",
  "figma-daemon path ",
  "figma-daemon boolean ",
  "figma-daemon component combine",
  "figma-daemon node to-component ",
];

const TEXT_MUTATION_PATTERNS = [
  "figma-daemon set text ",
  "figma-daemon set font ",
  "figma-daemon set font-range ",
  "figma-daemon set text-resize ",
];

const FRAME_PROPERTY_MUTATION_PATTERNS = [
  "figma-daemon set fill ",
  "figma-daemon set stroke ",
  "figma-daemon set stroke-align ",
  "figma-daemon set radius ",
  "figma-daemon set opacity ",
  "figma-daemon set rotation ",
  "figma-daemon set visible ",
  "figma-daemon set locked ",
  "figma-daemon set effect ",
  "figma-daemon set layout ",
  "figma-daemon set constraints ",
  "figma-daemon set blend ",
  "figma-daemon set image ",
  "figma-daemon set props ",
  "figma-daemon set minmax ",
  "figma-daemon node move ",
  "figma-daemon node resize ",
];

const VARIANT_ALLOWED_MUTATION_PATTERNS = [
  ...TEXT_MUTATION_PATTERNS,
  ...FRAME_PROPERTY_MUTATION_PATTERNS,
  "figma-daemon node rename ",
];

const CREATION_PATTERNS = [
  "figma-daemon render",
  "figma-daemon create ",
  "figma-daemon import",
  "figma-daemon node replace-with ",
];

const STRUCTURAL_PATTERNS = [
  ...CREATION_PATTERNS,
  "figma-daemon node clone ",
  "figma-daemon node delete ",
  "figma-daemon path ",
  "figma-daemon boolean ",
  "figma-daemon component combine",
  "figma-daemon node to-component ",
];

const manualScopeTargets = new Map<string, string>();

function includesAny(command: string, patterns: string[]): boolean {
  return patterns.some((pattern) => command.includes(pattern));
}

function extractNodeIds(command: string): string[] {
  return [...command.matchAll(NODE_ID_PATTERN)]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));
}

function getAllowedNodeIds(
  targetNodeId: string | undefined,
  discoveredNodeIds: Set<string>,
  approvedNodeIds: Set<string>,
  variantCloneIds: Set<string>,
): Set<string> {
  const ids = new Set<string>([
    ...discoveredNodeIds,
    ...approvedNodeIds,
    ...variantCloneIds,
  ]);

  if (targetNodeId) {
    ids.add(targetNodeId);
  }

  return ids;
}

function ensureKnownNodeScope(
  referencedNodeIds: string[],
  allowedNodeIds: Set<string>,
  targetNodeId: string | undefined,
): void {
  if (referencedNodeIds.length === 0) {
    return;
  }

  const outOfScopeIds = referencedNodeIds.filter((id) => !allowedNodeIds.has(id));
  if (outOfScopeIds.length === 0) {
    return;
  }

  throw new Error(
    `[SCOPE-LOCK] Blocked Figma mutation outside the approved target subtree. ` +
      `Attempted: ${outOfScopeIds.join(", ")}. ` +
      `Target: ${targetNodeId ?? "unknown"}. Inspect the full target frame and only mutate approved descendants.`,
  );
}

function ensureScopedCreation(
  command: string,
  referencedNodeIds: string[],
  allowedNodeIds: Set<string>,
  targetNodeId: string | undefined,
): void {
  if (!includesAny(command, CREATION_PATTERNS)) {
    return;
  }

  const hasScopedParent = referencedNodeIds.some((id) => allowedNodeIds.has(id));
  if (hasScopedParent) {
    return;
  }

  throw new Error(
    `[SCOPE-LOCK] Blocked unscoped Figma creation. Creation commands must parent into the target subtree (${targetNodeId ?? "unknown"}).`,
  );
}

function assertTextOnlyIntent(command: string): void {
  if (includesAny(command, STRUCTURAL_PATTERNS)) {
    throw new Error(
      "[DESIGN-INTENT] text_only intent only allows edits on existing text nodes. Clone, create, render, import, delete, and replace operations are blocked.",
    );
  }

  if (!includesAny(command, TEXT_MUTATION_PATTERNS)) {
    throw new Error(
      "[DESIGN-INTENT] text_only intent only allows `figma-daemon set text`, `set font`, `set font-range`, and `set text-resize`.",
    );
  }
}

function assertFramePropsOnlyIntent(command: string): void {
  if (includesAny(command, TEXT_MUTATION_PATTERNS)) {
    throw new Error(
      "[DESIGN-INTENT] frame_props_only intent blocks text content and typography edits. Limit changes to frame and subtree properties only.",
    );
  }

  if (includesAny(command, STRUCTURAL_PATTERNS)) {
    throw new Error(
      "[DESIGN-INTENT] frame_props_only intent blocks structural mutations such as create, render, import, clone, replace, and delete.",
    );
  }

  if (!includesAny(command, FRAME_PROPERTY_MUTATION_PATTERNS)) {
    throw new Error(
      "[DESIGN-INTENT] frame_props_only intent only allows non-structural frame property edits such as fill, stroke, layout, move, resize, and similar property setters.",
    );
  }
}

function assertCreateVariantsIntent(
  command: string,
  referencedNodeIds: string[],
  targetNodeId: string | undefined,
  variantCloneIds: Set<string>,
): void {
  if (includesAny(command, CREATION_PATTERNS)
    || command.includes("figma-daemon node replace-with ")
    || command.includes("figma-daemon node delete ")
    || command.includes("figma-daemon path ")
    || command.includes("figma-daemon boolean ")
    || command.includes("figma-daemon component combine")
    || command.includes("figma-daemon node to-component ")) {
    throw new Error(
      "[DESIGN-INTENT] create_variants intent must clone the existing target into sibling variants. Fresh renders, imports, deletes, and component-set conversion are blocked.",
    );
  }

  if (command.includes("figma-daemon node clone ")) {
    if (referencedNodeIds.length === 0) {
      throw new Error(
        "[DESIGN-INTENT] create_variants intent requires cloning the target node explicitly.",
      );
    }

    const cloneSources = new Set<string>([
      ...(targetNodeId ? [targetNodeId] : []),
      ...variantCloneIds,
    ]);
    const invalidSources = referencedNodeIds.filter((id) => !cloneSources.has(id));
    if (invalidSources.length > 0) {
      throw new Error(
        `[DESIGN-INTENT] create_variants intent can only clone the original target or previously approved variant clones. Invalid clone source(s): ${invalidSources.join(", ")}.`,
      );
    }
    return;
  }

  if (!includesAny(command, VARIANT_ALLOWED_MUTATION_PATTERNS)) {
    throw new Error(
      "[DESIGN-INTENT] create_variants intent only allows clone, rename, move, resize, and set-* edits on approved variant clones.",
    );
  }

  const invalidTargets = referencedNodeIds.filter((id) => !variantCloneIds.has(id));
  if (invalidTargets.length > 0) {
    throw new Error(
      `[DESIGN-INTENT] create_variants intent blocks in-place edits on the original frame/component. Only approved variant clones may be mutated. Invalid target(s): ${invalidTargets.join(", ")}.`,
    );
  }
}

function assertFullRedesignIntent(command: string): void {
  if (command.includes("figma-daemon node clone ")) {
    throw new Error(
      "[DESIGN-INTENT] full_redesign intent does not allow cloning the target into variants. Use create_variants intent for sibling variants.",
    );
  }
}

export function setScopeTarget(sessionId: string, nodeId: string): void {
  manualScopeTargets.set(sessionId, nodeId);
}

export function clearScopeTarget(sessionId: string): void {
  manualScopeTargets.delete(sessionId);
  clearDesignIntentState(sessionId);
}

export function createScopeLockHook(ctx: PluginInput) {
  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown>; message?: string },
    ): Promise<void> => {
      if (input.tool !== "bash") return;

      const originalCommand = output.args.command;
      if (typeof originalCommand !== "string" || originalCommand.length === 0) {
        return;
      }

      const command = originalCommand.toLowerCase();
      if (!includesAny(command, CANVAS_MUTATION_PATTERNS)) {
        return;
      }

      const resolvedState = await resolveDesignIntentState(ctx, input.sessionID);
      const targetNodeId =
        manualScopeTargets.get(input.sessionID) ?? resolvedState.targetNodeId;

      if (!resolvedState.isDesignSession && !targetNodeId) {
        return;
      }

      if (!resolvedState.designPlan) {
        throw new Error(
          "[DESIGN-PLAN] No `## Design Plan` block was found in this session. Emit a plan artifact with Plan Mode, Mutation Steps, Verification Steps, and Review Requirements before mutating the Figma canvas.",
        );
      }

      const ownerSessionId = resolvedState.designPlan.ownerSessionId;
      if (
        ownerSessionId
        && !resolvedState.planAccessSessionIds.has(ownerSessionId)
      ) {
        throw new Error(
          `[DESIGN-PLAN] Design plan ownership mismatch. This session may only execute artifacts owned by its lineage. Plan owner: ${ownerSessionId}. Current session: ${input.sessionID}.`,
        );
      }

      if (!isExecutableDesignPlanStatus(resolvedState.designPlan.status)) {
        throw new Error(
          `[DESIGN-PLAN] Design plan status must be \`ready\` or \`approved-for-execution\` before mutating the Figma canvas. Current status: ${resolvedState.designPlan.status}.`,
        );
      }

      if (!resolvedState.editIntent) {
        throw new Error(
          "[DESIGN-INTENT] No `Edit Intent` classification was found in this session. Emit a valid Design Plan artifact with Edit Intent before mutating the Figma canvas.",
        );
      }

      const referencedNodeIds = extractNodeIds(originalCommand);
      const allowedNodeIds = getAllowedNodeIds(
        targetNodeId,
        resolvedState.discoveredNodeIds,
        resolvedState.approvedNodeIds,
        resolvedState.variantCloneIds,
      );

      ensureKnownNodeScope(referencedNodeIds, allowedNodeIds, targetNodeId);
      ensureScopedCreation(
        command,
        referencedNodeIds,
        allowedNodeIds,
        targetNodeId,
      );

      switch (resolvedState.editIntent) {
        case "text_only":
          assertTextOnlyIntent(command);
          break;
        case "frame_props_only":
          assertFramePropsOnlyIntent(command);
          break;
        case "create_variants":
          assertCreateVariantsIntent(
            command,
            referencedNodeIds,
            targetNodeId,
            resolvedState.variantCloneIds,
          );
          break;
        case "full_redesign":
          assertFullRedesignIntent(command);
          break;
      }

      log("[scope-lock] Allowed design mutation", {
        sessionID: input.sessionID,
        editIntent: resolvedState.editIntent,
        targetNodeId,
        referencedNodeIds,
      });
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

      manualScopeTargets.delete(sessionID);
      clearDesignIntentState(sessionID);
    },
  };
}
