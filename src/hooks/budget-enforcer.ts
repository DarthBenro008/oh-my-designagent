import type { PluginInput } from "@opencode-ai/plugin"
import {
  clearSessionBudgetSession,
  getSessionBudgetExceededMessage,
  recordSessionBudgetCost,
  registerSessionBudgetSession,
} from "../shared/session-budget"
import { log } from "../shared/logger"

type EventInput = {
  event: {
    type: string
    properties?: unknown
  }
}

async function abortSessions(
  ctx: PluginInput,
  sessionIDs: string[],
  sourceSessionID: string,
): Promise<void> {
  for (const sessionID of sessionIDs) {
    await ctx.client.session.abort({ path: { id: sessionID } }).catch((error) => {
      log("[budget-enforcer] Failed to abort session", {
        sourceSessionID,
        sessionID,
        error,
      })
    })
  }
}

async function showBudgetToast(ctx: PluginInput, message: string): Promise<void> {
  await ctx.client.tui.showToast({
    body: {
      title: "Budget Exceeded",
      message,
      variant: "error",
      duration: 8000,
    },
  }).catch((error) => {
    log("[budget-enforcer] Failed to show toast", { error })
  })
}

export function createBudgetEnforcerHook(ctx: PluginInput) {
  return {
    event: async ({ event }: EventInput): Promise<void> => {
      const props = event.properties as Record<string, unknown> | undefined

      if (event.type === "session.created") {
        const sessionInfo = props?.info as { id?: string; parentID?: string } | undefined
        if (sessionInfo?.id) {
          registerSessionBudgetSession(sessionInfo.id, sessionInfo.parentID)
        }
        return
      }

      if (event.type === "session.deleted") {
        const sessionInfo = props?.info as { id?: string } | undefined
        if (sessionInfo?.id) {
          clearSessionBudgetSession(sessionInfo.id)
        }
        return
      }

      if (event.type !== "message.updated") return

      const info = props?.info as {
        id?: string
        role?: string
        sessionID?: string
        sessionId?: string
        cost?: number
      } | undefined

      const sessionID = info?.sessionID ?? info?.sessionId
      if (!sessionID || info?.role !== "assistant" || typeof info.id !== "string" || typeof info.cost !== "number") {
        return
      }

      const outcome = recordSessionBudgetCost({
        sessionID,
        messageID: info.id,
        costUsd: info.cost,
      })
      if (!outcome?.firstExceeded) return

      const message = getSessionBudgetExceededMessage(outcome.totalUsd, outcome.limitUsd)
      await abortSessions(ctx, outcome.abortSessionIDs, sessionID)
      await showBudgetToast(ctx, message)
    },
  }
}
