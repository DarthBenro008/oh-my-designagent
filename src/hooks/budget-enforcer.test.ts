import { afterEach, describe, expect, it, mock } from "bun:test"
import { createBudgetEnforcerHook } from "./budget-enforcer"
import {
  _resetSessionBudgetStateForTesting,
  SESSION_BUDGET_ENV_VAR,
} from "../shared/session-budget"

const originalBudgetEnv = process.env[SESSION_BUDGET_ENV_VAR]

function createMockContext() {
  return {
    client: {
      session: {
        abort: mock(() => Promise.resolve({})),
      },
      tui: {
        showToast: mock(() => Promise.resolve({})),
      },
    },
  }
}

afterEach(() => {
  _resetSessionBudgetStateForTesting()
  if (originalBudgetEnv === undefined) {
    delete process.env[SESSION_BUDGET_ENV_VAR]
  } else {
    process.env[SESSION_BUDGET_ENV_VAR] = originalBudgetEnv
  }
})

describe("budget-enforcer hook", () => {
  it("aborts the child and root sessions once when the shared budget is exceeded", async () => {
    process.env[SESSION_BUDGET_ENV_VAR] = "0.50"
    const ctx = createMockContext()
    const hook = createBudgetEnforcerHook(ctx as never)

    await hook.event({
      event: {
        type: "session.created",
        properties: {
          info: { id: "ses_root" },
        },
      },
    })
    await hook.event({
      event: {
        type: "session.created",
        properties: {
          info: { id: "ses_child", parentID: "ses_root" },
        },
      },
    })
    await hook.event({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg_root",
            role: "assistant",
            sessionID: "ses_root",
            cost: 0.30,
          },
        },
      },
    })
    await hook.event({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg_child",
            role: "assistant",
            sessionID: "ses_child",
            cost: 0.25,
          },
        },
      },
    })
    await hook.event({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg_child",
            role: "assistant",
            sessionID: "ses_child",
            cost: 0.25,
          },
        },
      },
    })

    expect(ctx.client.session.abort.mock.calls).toEqual([
      [{ path: { id: "ses_child" } }],
      [{ path: { id: "ses_root" } }],
    ])
    expect(ctx.client.tui.showToast.mock.calls).toHaveLength(1)
    expect(ctx.client.tui.showToast.mock.calls[0]?.[0]).toMatchObject({
      body: {
        title: "Budget Exceeded",
        variant: "error",
      },
    })
  })
})
