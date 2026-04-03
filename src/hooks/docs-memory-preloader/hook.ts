import type { PluginInput } from "@opencode-ai/plugin"
import type { DesignMemoryConfig } from "../../config"
import type { ContextCollector } from "../../features/context-injector"
import { getSessionAgent } from "../../features/claude-code-session-state"
import { loadDesignMemoryPacket } from "../../shared/design-memory"
import { getAgentConfigKey } from "../../shared/agent-display-names"
import { log } from "../../shared/logger"
import {
  isSystemDirective,
  removeSystemReminders,
} from "../../shared/system-directive"

const DESIGN_AGENT_KEYS = new Set([
  "sisyphus",
  "atlas",
  "hephaestus",
  "sisyphus-junior",
  "metis",
  "momus",
  "oracle",
])

const DESIGN_HINTS = [
  "figma",
  "comment",
  "design",
  "component",
  "spacing",
  "typography",
  "layout",
  "token",
  "color",
  "copy",
  "canvas",
  "variant",
]

function extractPromptText(
  parts: Array<{ type: string; text?: string; [key: string]: unknown }>,
): string {
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim()
}

function isDesignPrompt(prompt: string): boolean {
  const lowerPrompt = prompt.toLowerCase()
  return DESIGN_HINTS.some((hint) => lowerPrompt.includes(hint))
}

function shouldPreloadDocsMemory(args: {
  config: DesignMemoryConfig
  agent?: string
  prompt: string
  sessionID: string
}): boolean {
  if (!args.config.enabled) {
    return false
  }

  const currentAgent = getSessionAgent(args.sessionID) ?? args.agent
  const agentKey = currentAgent ? getAgentConfigKey(currentAgent) : undefined
  if (agentKey && DESIGN_AGENT_KEYS.has(agentKey)) {
    return true
  }

  if (!args.config.auto_load_for_comment_resolution) {
    return false
  }

  return isDesignPrompt(args.prompt)
}

function formatMemoryContext(summary: string): string {
  return [
    "## Docs Memory",
    "",
    "Use these project docs as instructions and rules before resolving the request.",
    "If they conflict with an obvious visual tweak, surface the conflict instead of guessing.",
    "",
    summary,
  ].join("\n")
}

export function createDocsMemoryPreloaderHook(
  ctx: PluginInput,
  config: DesignMemoryConfig | undefined,
  collector: ContextCollector,
) {
  return {
    "chat.message": async (
      input: {
        sessionID: string
        agent?: string
      },
      output: {
        parts: Array<{ type: string; text?: string; [key: string]: unknown }>
      },
    ): Promise<void> => {
      if (!config?.enabled) {
        return
      }

      const prompt = extractPromptText(output.parts)
      if (!prompt || isSystemDirective(prompt)) {
        return
      }

      const cleanPrompt = removeSystemReminders(prompt)
      if (!shouldPreloadDocsMemory({
        config,
        agent: input.agent,
        prompt: cleanPrompt,
        sessionID: input.sessionID,
      })) {
        return
      }

      const packet = loadDesignMemoryPacket({
        directory: ctx.directory,
        config,
        prompt: cleanPrompt,
      })

      if (!packet.summary || packet.files.length === 0) {
        return
      }

      collector.register(input.sessionID, {
        id: "docs-memory",
        source: "docs-memory",
        content: formatMemoryContext(packet.summary),
        priority: "critical",
        metadata: {
          fileCount: packet.files.length,
          files: packet.files.map((file) => file.relativePath),
        },
      })

      log("[docs-memory-preloader] Registered docs-first memory packet", {
        sessionID: input.sessionID,
        fileCount: packet.files.length,
      })
    },
  }
}
