import type { AgentConfig } from "@opencode-ai/sdk";
import type {
  BuiltinAgentName,
  AgentOverrides,
  AgentFactory,
  AgentPromptMetadata,
} from "./types";
import type { CategoriesConfig, GitMasterConfig } from "../config/schema";
import type { LoadedSkill } from "../features/opencode-skill-loader/types";
import type { BrowserAutomationProvider } from "../config/schema";
import { loadDesignMemoryPacket } from "../shared/design-memory";
import type {
  DesignMemoryConfig,
  FigmaUseConfig,
  FigmaUseMode,
} from "../config";
import {
  createCommentPlannerAgent,
  COMMENT_PLANNER_PROMPT_METADATA,
  createVisionReviewerAgent,
  VISION_REVIEWER_PROMPT_METADATA,
  createDesignAuditorAgent,
  DESIGN_AUDITOR_PROMPT_METADATA,
} from "./design-agents";
import { createLibrarianAgent, LIBRARIAN_PROMPT_METADATA } from "./librarian";
import { createExploreAgent, EXPLORE_PROMPT_METADATA } from "./explore";
import {
  createMultimodalLookerAgent,
  MULTIMODAL_LOOKER_PROMPT_METADATA,
} from "./multimodal-looker";
import { createAtlasAgent, atlasPromptMetadata } from "./atlas";
import { createSisyphusJuniorAgentWithOverrides } from "./sisyphus-junior";
import type { AvailableCategory } from "./dynamic-agent-prompt-builder";
import {
  fetchAvailableModels,
  readConnectedProvidersCache,
  readProviderModelsCache,
} from "../shared";
import { CATEGORY_DESCRIPTIONS } from "../tools/delegate-task/constants";
import { mergeCategories } from "../shared/merge-categories";
import { buildAvailableSkills } from "./builtin-agents/available-skills";
import { collectPendingBuiltinAgents } from "./builtin-agents/general-agents";
import { maybeCreateSisyphusConfig } from "./builtin-agents/sisyphus-agent";
import { maybeCreateHephaestusConfig } from "./builtin-agents/hephaestus-agent";
import { maybeCreateAtlasConfig } from "./builtin-agents/atlas-agent";

type AgentSource = AgentFactory | AgentConfig;

/**
 * Metadata for each agent, used to build Sisyphus's dynamic prompt sections
 * (Delegation Table, Tool Selection, Key Triggers, etc.)
 */
const agentMetadata: Partial<Record<BuiltinAgentName, AgentPromptMetadata>> = {
  oracle: DESIGN_AUDITOR_PROMPT_METADATA,
  librarian: LIBRARIAN_PROMPT_METADATA,
  explore: EXPLORE_PROMPT_METADATA,
  "multimodal-looker": MULTIMODAL_LOOKER_PROMPT_METADATA,
  metis: COMMENT_PLANNER_PROMPT_METADATA,
  momus: VISION_REVIEWER_PROMPT_METADATA,
  atlas: atlasPromptMetadata,
};

export async function createBuiltinAgents(
  disabledAgents: string[] = [],
  agentOverrides: AgentOverrides = {},
  directory?: string,
  systemDefaultModel?: string,
  categories?: CategoriesConfig,
  gitMasterConfig?: GitMasterConfig,
  discoveredSkills: LoadedSkill[] = [],
  customAgentSummaries?: unknown,
  browserProvider?: BrowserAutomationProvider,
  uiSelectedModel?: string,
  disabledSkills?: Set<string>,
  useTaskSystem = false,
  disableOmoEnv = false,
  designMemoryConfig?: DesignMemoryConfig,
  figmaUseConfig?: FigmaUseConfig,
): Promise<Record<string, AgentConfig>> {
  const connectedProviders = readConnectedProvidersCache();
  const providerModelsConnected = connectedProviders
    ? (readProviderModelsCache()?.connected ?? [])
    : [];
  const mergedConnectedProviders = Array.from(
    new Set([...(connectedProviders ?? []), ...providerModelsConnected]),
  );
  // IMPORTANT: Do NOT call OpenCode client APIs during plugin initialization.
  // This function is called from config handler, and calling client API causes deadlock.
  // See: https://github.com/code-yeongyu/oh-my-openagent/issues/1301
  const availableModels = await fetchAvailableModels(undefined, {
    connectedProviders:
      mergedConnectedProviders.length > 0
        ? mergedConnectedProviders
        : undefined,
  });
  const isFirstRunNoCache =
    availableModels.size === 0 && mergedConnectedProviders.length === 0;

  const result: Record<string, AgentConfig> = {};

  const mergedCategories = mergeCategories(categories);

  const availableCategories: AvailableCategory[] = Object.entries(
    mergedCategories,
  ).map(([name]) => ({
    name,
    description:
      categories?.[name]?.description ??
      CATEGORY_DESCRIPTIONS[name] ??
      "General tasks",
  }));

  const availableSkills = buildAvailableSkills(
    discoveredSkills,
    browserProvider,
    disabledSkills,
  );
  const designMemoryPacket = loadDesignMemoryPacket({
    directory,
    config: designMemoryConfig,
  });
  const memorySummary = designMemoryPacket.summary;
  const figmaUseEnabled = figmaUseConfig?.enabled ?? false;
  const figmaUseServerName = figmaUseConfig?.mcp_server_name ?? "figma-daemon";
  const figmaUseMode: FigmaUseMode = figmaUseConfig?.mode ?? "mcp";

  const agentSources: Record<BuiltinAgentName, AgentSource> = {
    sisyphus: createAtlasAgent as unknown as AgentFactory,
    hephaestus: createAtlasAgent as unknown as AgentFactory,
    oracle: Object.assign(
      (model: string) =>
        createDesignAuditorAgent({
          model,
          memorySummary,
          figmaUseEnabled,
          figmaUseServerName,
          figmaUseMode,
        }),
      { mode: "subagent" as const },
    ),
    librarian: createLibrarianAgent,
    explore: createExploreAgent,
    "multimodal-looker": createMultimodalLookerAgent,
    metis: Object.assign(
      (model: string) =>
        createCommentPlannerAgent({
          model,
          memorySummary,
          figmaUseEnabled,
          figmaUseServerName,
          figmaUseMode,
        }),
      { mode: "subagent" as const },
    ),
    momus: Object.assign(
      (model: string) =>
        createVisionReviewerAgent({
          model,
          memorySummary,
        }),
      { mode: "subagent" as const },
    ),
    atlas: createAtlasAgent as AgentFactory,
    "sisyphus-junior":
      createSisyphusJuniorAgentWithOverrides as unknown as AgentFactory,
  };

  // Collect general agents first (for availableAgents), but don't add to result yet
  const { pendingAgentConfigs, availableAgents } = collectPendingBuiltinAgents({
    agentSources,
    agentMetadata,
    disabledAgents,
    agentOverrides,
    directory,
    systemDefaultModel,
    mergedCategories,
    gitMasterConfig,
    browserProvider,
    uiSelectedModel,
    availableModels,
    isFirstRunNoCache,
    disabledSkills,
    disableOmoEnv,
  });

  const sisyphusConfig = maybeCreateSisyphusConfig({
    disabledAgents,
    agentOverrides,
    uiSelectedModel,
    availableModels,
    systemDefaultModel,
    isFirstRunNoCache,
    availableAgents,
    availableSkills,
    availableCategories,
    mergedCategories,
    directory,
    userCategories: categories,
    useTaskSystem,
    memorySummary,
    figmaUseEnabled,
    figmaUseServerName,
    figmaUseMode,
    disableOmoEnv,
  });
  if (sisyphusConfig) {
    result["sisyphus"] = sisyphusConfig;
  }

  const hephaestusConfig = maybeCreateHephaestusConfig({
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
    figmaUseMode,
    disableOmoEnv,
  });
  if (hephaestusConfig) {
    result["hephaestus"] = hephaestusConfig;
  }

  // Add pending agents after sisyphus and hephaestus to maintain order
  for (const [name, config] of pendingAgentConfigs) {
    result[name] = config;
  }

  const atlasConfig = maybeCreateAtlasConfig({
    disabledAgents,
    agentOverrides,
    uiSelectedModel,
    availableModels,
    systemDefaultModel,
    availableAgents,
    availableSkills,
    mergedCategories,
    directory,
    userCategories: categories,
    memorySummary,
    figmaUseEnabled,
    figmaUseServerName,
    figmaUseMode,
  });
  if (atlasConfig) {
    result["atlas"] = atlasConfig;
  }

  return result;
}
