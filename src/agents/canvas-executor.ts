import type { AgentConfig } from "@opencode-ai/sdk";
import type { AgentOverrideConfig } from "../config/schema";
import type { FigmaUseMode } from "../config";
import { isGlmModel, isGptModel } from "./types";
import { createCanvasExecutorAgent } from "./design-agents";

export const CANVAS_EXECUTOR_DEFAULTS = {
  model: "anthropic/claude-sonnet-4-6",
  temperature: 0.1,
} as const;

export function createCanvasExecutorAgentWithOverrides(args: {
  override?: AgentOverrideConfig;
  systemDefaultModel?: string;
  memorySummary?: string;
  figmaUseEnabled?: boolean;
  figmaUseServerName?: string;
  figmaUseMode?: FigmaUseMode;
}): AgentConfig {
  let { override } = args;
  const {
    systemDefaultModel,
    memorySummary,
    figmaUseEnabled,
    figmaUseServerName,
    figmaUseMode,
  } = args;

  if (override?.disable) {
    override = undefined;
  }

  const model =
    override?.model ?? systemDefaultModel ?? CANVAS_EXECUTOR_DEFAULTS.model;
  const temperature =
    override?.temperature ?? CANVAS_EXECUTOR_DEFAULTS.temperature;

  const base = createCanvasExecutorAgent({
    model,
    memorySummary,
    figmaUseEnabled,
    figmaUseServerName,
    figmaUseMode,
    promptAppend: override?.prompt_append,
  });

  const config: AgentConfig = {
    ...base,
    temperature,
    description: override?.description ?? base.description,
    color: override?.color ?? base.color,
    permission: {
      ...base.permission,
      ...(override?.permission ?? {}),
      task: "deny",
      call_omo_agent: "deny",
    } as AgentConfig["permission"],
  };

  if (override?.top_p !== undefined) {
    config.top_p = override.top_p;
  }
  if (override?.maxTokens !== undefined) {
    config.maxTokens = override.maxTokens;
  }
  if (override?.prompt !== undefined) {
    config.prompt = override.prompt;
  }
  if (override?.mode !== undefined) {
    config.mode = override.mode;
  }
  if (override?.thinking !== undefined) {
    config.thinking = override.thinking;
  }
  if (override?.reasoningEffort !== undefined) {
    config.reasoningEffort = override.reasoningEffort;
  }
  if (override?.textVerbosity !== undefined) {
    config.textVerbosity = override.textVerbosity;
  }
  if (override?.providerOptions !== undefined) {
    config.providerOptions = override.providerOptions;
  }
  if (override?.fallback_models !== undefined) {
    (
      config as AgentConfig & {
        fallback_models?: AgentOverrideConfig["fallback_models"];
      }
    ).fallback_models = override.fallback_models;
  }
  if (override?.variant !== undefined) {
    config.variant = override.variant;
  }

  if (isGptModel(model) && config.reasoningEffort === undefined) {
    config.reasoningEffort = "medium";
  } else if (!isGlmModel(model) && config.thinking === undefined) {
    config.thinking = { type: "enabled", budgetTokens: 24000 };
  }

  return config;
}
