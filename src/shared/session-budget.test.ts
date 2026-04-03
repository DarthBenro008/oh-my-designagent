import { afterEach, describe, expect, it } from "bun:test"
import {
  _getSessionBudgetSnapshotForTesting,
  _resetSessionBudgetStateForTesting,
  clearSessionBudgetSession,
  getSessionBudgetExceededMessage,
  getSessionBudgetLimitUsd,
  recordSessionBudgetCost,
  registerSessionBudgetSession,
  SESSION_BUDGET_ENV_VAR,
} from "./session-budget"

const originalBudgetEnv = process.env[SESSION_BUDGET_ENV_VAR]

afterEach(() => {
  _resetSessionBudgetStateForTesting()
  if (originalBudgetEnv === undefined) {
    delete process.env[SESSION_BUDGET_ENV_VAR]
  } else {
    process.env[SESSION_BUDGET_ENV_VAR] = originalBudgetEnv
  }
})

describe("session-budget", () => {
  it("disables enforcement when the env var is not provided", () => {
    delete process.env[SESSION_BUDGET_ENV_VAR]

    expect(getSessionBudgetLimitUsd()).toBeNull()
    expect(
      recordSessionBudgetCost({
        sessionID: "ses_main",
        messageID: "msg_1",
        costUsd: 0.5,
      }),
    ).toBeNull()
  })

  it("treats empty, invalid, zero, and negative values as disabled", () => {
    expect(getSessionBudgetLimitUsd({ [SESSION_BUDGET_ENV_VAR]: "" })).toBeNull()
    expect(getSessionBudgetLimitUsd({ [SESSION_BUDGET_ENV_VAR]: "abc" })).toBeNull()
    expect(getSessionBudgetLimitUsd({ [SESSION_BUDGET_ENV_VAR]: "0" })).toBeNull()
    expect(getSessionBudgetLimitUsd({ [SESSION_BUDGET_ENV_VAR]: "-1" })).toBeNull()
  })

  it("accumulates message cost deltas and aborts the root session tree once", () => {
    process.env[SESSION_BUDGET_ENV_VAR] = "0.50"

    registerSessionBudgetSession("ses_root")
    registerSessionBudgetSession("ses_child", "ses_root")

    const first = recordSessionBudgetCost({
      sessionID: "ses_child",
      messageID: "msg_cost",
      costUsd: 0.20,
    })
    const second = recordSessionBudgetCost({
      sessionID: "ses_child",
      messageID: "msg_cost",
      costUsd: 0.35,
    })
    const third = recordSessionBudgetCost({
      sessionID: "ses_root",
      messageID: "msg_other",
      costUsd: 0.20,
    })
    const repeated = recordSessionBudgetCost({
      sessionID: "ses_child",
      messageID: "msg_other",
      costUsd: 0.20,
    })

    expect(first?.firstExceeded).toBe(false)
    expect(second?.totalUsd).toBe(0.35)
    expect(third?.firstExceeded).toBe(true)
    expect(third?.abortSessionIDs).toEqual(["ses_root"])
    expect(repeated?.firstExceeded).toBe(false)

    expect(_getSessionBudgetSnapshotForTesting("ses_child")).toEqual({
      rootSessionID: "ses_root",
      totalUsd: 0.55,
      aborted: true,
      trackedMessageCount: 2,
    })
  })

  it("aborts child and root when a child session exceeds the shared budget", () => {
    process.env[SESSION_BUDGET_ENV_VAR] = "0.40"

    registerSessionBudgetSession("ses_root")
    registerSessionBudgetSession("ses_child", "ses_root")

    recordSessionBudgetCost({
      sessionID: "ses_root",
      messageID: "msg_root",
      costUsd: 0.25,
    })
    const outcome = recordSessionBudgetCost({
      sessionID: "ses_child",
      messageID: "msg_child",
      costUsd: 0.20,
    })

    expect(outcome?.firstExceeded).toBe(true)
    expect(outcome?.abortSessionIDs).toEqual(["ses_child", "ses_root"])
  })

  it("clears the root budget bucket when the root session is deleted", () => {
    process.env[SESSION_BUDGET_ENV_VAR] = "1.00"

    registerSessionBudgetSession("ses_root")
    registerSessionBudgetSession("ses_child", "ses_root")
    recordSessionBudgetCost({
      sessionID: "ses_child",
      messageID: "msg_child",
      costUsd: 0.20,
    })

    clearSessionBudgetSession("ses_root")

    expect(_getSessionBudgetSnapshotForTesting("ses_root")).toBeNull()
    expect(_getSessionBudgetSnapshotForTesting("ses_child")).toBeNull()
  })

  it("formats the user-facing budget exceeded message", () => {
    expect(getSessionBudgetExceededMessage(0.5821, 0.5)).toBe(
      "Budget exceeded: spent $0.5821 over limit $0.5000. Session aborted.",
    )
  })
})
