import type { PluginInput } from "@opencode-ai/plugin";
import { log } from "../../shared/logger";

const MUTATION_COMMANDS = [
  "figma-daemon set",
  "figma-daemon node move",
  "figma-daemon node resize",
  "figma-daemon node delete",
  "figma-daemon render",
  "figma-daemon node replace-with",
];

const sessionScopeTargets = new Map<string, string>();

export function setScopeTarget(sessionId: string, nodeId: string): void {
  sessionScopeTargets.set(sessionId, nodeId);
}

export function clearScopeTarget(sessionId: string): void {
  sessionScopeTargets.delete(sessionId);
}

export function createScopeLockHook(_ctx: PluginInput) {
  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown>; message?: string },
    ): Promise<void> => {
      if (input.tool !== "bash") return;

      const command = output.args.command as string | undefined;
      if (!command) return;

      const isMutation = MUTATION_COMMANDS.some((cmd) => command.includes(cmd));
      if (!isMutation) return;

      const scopeTarget = sessionScopeTargets.get(input.sessionID);
      if (!scopeTarget) return;

      const nodeIdPattern = /\b(I?\d+:\d+(?:;\d+:\d+)*)\b/g;
      const matches = [...command.matchAll(nodeIdPattern)].map((m) => m[1]);

      if (matches.length === 0) return;

      const hasTargetNode = matches.some(
        (id) => id === scopeTarget || id.startsWith(scopeTarget),
      );
      if (hasTargetNode) return;

      const warning = `[SCOPE-LOCK] Warning: You are attempting to modify node(s) [${matches.join(", ")}] but the scope is locked to [${scopeTarget}]. Only modify the target node and its descendants. If this is intentional (e.g., creating a new node at a parent location), ignore this warning.`;

      log(`[scope-lock] scope warning injected`, {
        sessionID: input.sessionID,
        scopeTarget,
        attemptedNodes: matches,
      });

      output.message = (output.message ?? "") + "\n\n" + warning;
    },
  };
}
