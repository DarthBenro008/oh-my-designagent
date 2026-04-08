import type { PluginInput } from "@opencode-ai/plugin"
import type { MessageData, ResumeConfig } from "./types"
import { createInternalAgentTextPart, resolveInheritedPromptTools } from "../../shared"

const RECOVERY_RESUME_TEXT = "[session recovered - continuing previous task]"

type Client = PluginInput["client"]

export function findLastUserMessage(messages: MessageData[]): MessageData | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].info?.role === "user") {
      return messages[i]
    }
  }
  return undefined
}

export function extractResumeConfig(userMessage: MessageData | undefined, sessionID: string): ResumeConfig {
  return {
    sessionID,
    agent: userMessage?.info?.agent,
    model: userMessage?.info?.model,
    tools: userMessage?.info?.tools,
  }
}

export async function resumeSession(client: Client, config: ResumeConfig): Promise<boolean> {
  try {
    const inheritedTools = resolveInheritedPromptTools(config.sessionID, config.tools)
    await client.session.promptAsync({
      path: { id: config.sessionID },
      body: {
        parts: [createInternalAgentTextPart(RECOVERY_RESUME_TEXT)],
        agent: config.agent,
        model: config.model,
        ...(inheritedTools ? { tools: inheritedTools } : {}),
      },
    })
    return true
  } catch {
    return false
  }
}
