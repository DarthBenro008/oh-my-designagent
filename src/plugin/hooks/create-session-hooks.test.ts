import { afterEach, describe, expect, it } from "bun:test"
import type { OhMyOpenCodeConfig } from "../../config"
import type { ModelCacheState } from "../../plugin-state"
import type { PluginContext } from "../types"
import {
  _resetSessionBudgetStateForTesting,
  SESSION_BUDGET_ENV_VAR,
} from "../../shared/session-budget"
import { createSessionHooks } from "./create-session-hooks"

const mockContext = {
  directory: "/tmp",
  client: {
    tui: {
      showToast: async () => ({}),
    },
    session: {
      get: async () => ({ data: null }),
      update: async () => ({}),
    },
  },
} as unknown as PluginContext

const mockModelCacheState = {} as ModelCacheState
const originalBudgetEnv = process.env[SESSION_BUDGET_ENV_VAR]

afterEach(() => {
  _resetSessionBudgetStateForTesting()
  if (originalBudgetEnv === undefined) {
    delete process.env[SESSION_BUDGET_ENV_VAR]
  } else {
    process.env[SESSION_BUDGET_ENV_VAR] = originalBudgetEnv
  }
})

describe("createSessionHooks", () => {
  it("keeps model fallback disabled when config is unset", () => {
    // given
    const pluginConfig = {} as OhMyOpenCodeConfig

    // when
    const result = createSessionHooks({
      ctx: mockContext,
      pluginConfig,
      modelCacheState: mockModelCacheState,
      isHookEnabled: (hookName) => hookName === "model-fallback",
      safeHookEnabled: true,
    })

    // then
    expect(result.modelFallback).toBeNull()
  })

  it("creates model fallback hook when config explicitly enables it", () => {
    // given
    const pluginConfig = { model_fallback: true } as OhMyOpenCodeConfig

    // when
    const result = createSessionHooks({
      ctx: mockContext,
      pluginConfig,
      modelCacheState: mockModelCacheState,
      isHookEnabled: (hookName) => hookName === "model-fallback",
      safeHookEnabled: true,
    })

    // then
    expect(result.modelFallback).not.toBeNull()
  })

  it("creates the budget enforcer hook only when the env limit is enabled", () => {
    const pluginConfig = {} as OhMyOpenCodeConfig

    delete process.env[SESSION_BUDGET_ENV_VAR]
    const disabledResult = createSessionHooks({
      ctx: mockContext,
      pluginConfig,
      modelCacheState: mockModelCacheState,
      isHookEnabled: (hookName) => hookName === "budget-enforcer",
      safeHookEnabled: true,
    })

    process.env[SESSION_BUDGET_ENV_VAR] = "0.25"
    const enabledResult = createSessionHooks({
      ctx: mockContext,
      pluginConfig,
      modelCacheState: mockModelCacheState,
      isHookEnabled: (hookName) => hookName === "budget-enforcer",
      safeHookEnabled: true,
    })

    expect(disabledResult.budgetEnforcer).toBeNull()
    expect(enabledResult.budgetEnforcer).not.toBeNull()
  })
})
