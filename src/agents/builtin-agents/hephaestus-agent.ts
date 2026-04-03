import type { AgentConfig } from "@opencode-ai/sdk"
import type { AgentOverrides } from "../types"
import type { CategoryConfig } from "../../config/schema"
import type { AvailableAgent, AvailableCategory, AvailableSkill } from "../dynamic-agent-prompt-builder"
import { AGENT_MODEL_REQUIREMENTS, isAnyProviderConnected } from "../../shared"
import { createDesignWorkerAgent } from "../design-agents"
import { applyEnvironmentContext } from "./environment-context"
import { applyCategoryOverride, mergeAgentConfig } from "./agent-overrides"
import { applyModelResolution, getFirstFallbackModel } from "./model-resolution"

export function maybeCreateHephaestusConfig(input: {
  disabledAgents: string[]
  agentOverrides: AgentOverrides
  availableModels: Set<string>
  systemDefaultModel?: string
  isFirstRunNoCache: boolean
  availableAgents: AvailableAgent[]
  availableSkills: AvailableSkill[]
  availableCategories: AvailableCategory[]
  mergedCategories: Record<string, CategoryConfig>
  directory?: string
  useTaskSystem?: boolean
  memorySummary?: string
  figmaUseEnabled?: boolean
  figmaUseServerName?: string
  disableOmoEnv?: boolean
}): AgentConfig | undefined {
  const {
    disabledAgents,
    agentOverrides,
    availableModels,
    systemDefaultModel,
    isFirstRunNoCache,
    availableAgents,
    availableSkills,
    availableCategories,
    mergedCategories,
    directory,
    memorySummary,
    figmaUseEnabled,
    figmaUseServerName,
    disableOmoEnv = false,
  } = input

  if (disabledAgents.includes("hephaestus")) return undefined

  const hephaestusOverride = agentOverrides["hephaestus"]
  const hephaestusRequirement = AGENT_MODEL_REQUIREMENTS["hephaestus"]
  const hasHephaestusExplicitConfig = hephaestusOverride !== undefined

  const hasRequiredProvider =
    !hephaestusRequirement?.requiresProvider ||
    hasHephaestusExplicitConfig ||
    isFirstRunNoCache ||
    isAnyProviderConnected(hephaestusRequirement.requiresProvider, availableModels)

  if (!hasRequiredProvider) return undefined

  let hephaestusResolution = applyModelResolution({
    userModel: hephaestusOverride?.model,
    requirement: hephaestusRequirement,
    availableModels,
    systemDefaultModel,
  })

  if (isFirstRunNoCache && !hephaestusOverride?.model) {
    hephaestusResolution = getFirstFallbackModel(hephaestusRequirement)
  }

  if (!hephaestusResolution) return undefined
  const { model: hephaestusModel, variant: hephaestusResolvedVariant } = hephaestusResolution

  let hephaestusConfig = createDesignWorkerAgent({
    model: hephaestusModel,
    availableAgents,
    availableSkills,
    availableCategories,
    memorySummary,
    figmaUseEnabled,
    figmaUseServerName,
  })

  hephaestusConfig = { ...hephaestusConfig, variant: hephaestusResolvedVariant ?? "medium" }

  const hepOverrideCategory = (hephaestusOverride as Record<string, unknown> | undefined)?.category as string | undefined
  if (hepOverrideCategory) {
    hephaestusConfig = applyCategoryOverride(hephaestusConfig, hepOverrideCategory, mergedCategories)
  }

  hephaestusConfig = applyEnvironmentContext(hephaestusConfig, directory, { disableOmoEnv })

  if (hephaestusOverride) {
    hephaestusConfig = mergeAgentConfig(hephaestusConfig, hephaestusOverride, directory)
  }
  return hephaestusConfig
}
