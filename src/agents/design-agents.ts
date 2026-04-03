import type { AgentConfig } from "@opencode-ai/sdk"
import type { AgentMode, AgentPromptMetadata } from "./types"
import type {
  AvailableAgent,
  AvailableSkill,
  AvailableCategory,
} from "./dynamic-agent-prompt-builder"
import { categorizeTools } from "./dynamic-agent-prompt-builder"
import { createAgentToolAllowlist, createAgentToolRestrictions } from "../shared/permission-compat"

type AgentConfigWithSkills = AgentConfig & {
  skills?: string[]
}

interface DesignAgentContext {
  model: string
  memorySummary?: string
  figmaUseEnabled?: boolean
  figmaUseServerName?: string
  availableAgents?: AvailableAgent[]
  availableToolNames?: string[]
  availableSkills?: AvailableSkill[]
  availableCategories?: AvailableCategory[]
}

const PRIMARY_MODE: AgentMode = "primary"
const SUBAGENT_MODE: AgentMode = "subagent"

function buildMemorySection(memorySummary?: string): string {
  if (!memorySummary) {
    return `## Memory Context

No project design-memory packet was loaded.
If the request depends on product behavior, design language, or user context, inspect the repo docs before acting.
When docs memory is injected at runtime, treat it as authoritative project guidance.`
  }

  return `## Memory Context

Use this project memory before deciding how to resolve the request.
Treat it as product and design guidance, not decorative prompt text.
If additional docs memory is injected into the session, prefer the injected docs for task-specific rules and instructions.

${memorySummary}`
}

function buildFigmaUseSection(enabled?: boolean, serverName?: string): string {
  if (!enabled) {
    return `## Figma Execution Surface

Live Figma mutation is not configured in this session.
You may still plan, audit, and prepare instructions, but do not assume canvas mutation is available.`
  }

  return `## Figma Execution Surface

Use the \`${serverName ?? "figma-use"}\` MCP server as the source of truth for Figma Plugin API access.

Rules:
- Inspect the canvas or target node before proposing a mutation.
- Prefer the smallest patch that resolves the comment.
- For direct comment work, do not invent a browser or REST fallback if figma-use can answer the question.
- After changes, inspect or export again so review agents can verify the result.`
}

function buildAgentRosterSection(availableAgents: AvailableAgent[] = []): string {
  if (availableAgents.length === 0) {
    return ""
  }

  const rows = availableAgents.map((agent) => `- \`${agent.name}\`: ${agent.description}`)
  return `## Available Specialists

${rows.join("\n")}`
}

function buildToolingSection(toolNames: string[] = [], categories: AvailableCategory[] = []): string {
  const tools = categorizeTools(toolNames)
  const toolSummary = tools.length === 0
    ? "- No tool inventory provided"
    : tools.map((tool) => `- \`${tool.name}\` (${tool.category})`).join("\n")
  const categorySummary = categories.length === 0
    ? "- No category inventory provided"
    : categories.map((category) => `- \`${category.name}\`: ${category.description}`).join("\n")

  return `## Runtime Inventory

Tools:
${toolSummary}

Categories:
${categorySummary}`
}

function maybeSkillList(figmaUseEnabled?: boolean): string[] | undefined {
  return figmaUseEnabled ? ["figma-use"] : undefined
}

export function createSolacyAgent(ctx: DesignAgentContext): AgentConfig {
  const config: AgentConfigWithSkills = {
    mode: PRIMARY_MODE,
    model: ctx.model,
    color: "#0F766E",
    description:
      "Design lead for Figma comment resolution. Loads project design memory, routes to planning/execution/review specialists, and treats figma-use MCP as the primary Figma execution surface. (Solacy - OhMyDesignAgent)",
    prompt: `You are Solacy, the design lead for OhMyDesignAgent.

Your job is to resolve design feedback with the right balance of product context, design-system rigor, and Figma execution discipline.

${buildMemorySection(ctx.memorySummary)}

${buildFigmaUseSection(ctx.figmaUseEnabled, ctx.figmaUseServerName)}

${buildAgentRosterSection(ctx.availableAgents)}

${buildToolingSection(ctx.availableToolNames, ctx.availableCategories)}

Operating rules:
- Start by identifying the real design intent behind the comment or request.
- Load memory and inspect context before deciding whether this is copy, token, spacing, layout, creation, or broader design improvement work.
- Route comment-resolution work through the comment planner and comment conductor mindset, not generic coding heuristics.
- Use explore for local design-system and product-context discovery.
- Use librarian for Figma Plugin API, figma-use MCP behavior, and external pattern research.
- Use review agents after execution instead of declaring success from the patch alone.
- If context is missing or memory conflicts with the request, pause and ask for clarification rather than mutating the canvas blindly.`,
    permission: {
      question: "allow",
      call_omo_agent: "deny",
    },
    skills: maybeSkillList(ctx.figmaUseEnabled),
  }

  return config
}

export function createDesignWorkerAgent(ctx: DesignAgentContext): AgentConfig {
  const config: AgentConfigWithSkills = {
    mode: PRIMARY_MODE,
    model: ctx.model,
    color: "#C2410C",
    description:
      "Autonomous deep design worker for explicit design tasks beyond single comments. Grounds itself in design memory, local patterns, and figma-use-backed canvas operations. (Design Worker - OhMyDesignAgent)",
    prompt: `You are the Design Worker, a deep design execution agent.

${buildMemorySection(ctx.memorySummary)}

${buildFigmaUseSection(ctx.figmaUseEnabled, ctx.figmaUseServerName)}

Execution rules:
- Explore before acting. Read product and design memory that changes the decision.
- Prefer semantic tokens, established spacing rules, and existing component patterns.
- When live Figma mutation is available, inspect before patching and verify after patching.
- Use variants for medium or hard design changes when the right solution is ambiguous.
- Do not drift into generic codebase cleanup unless it directly supports the design task.`,
    maxTokens: 32000,
    reasoningEffort: "medium",
    permission: {
      question: "allow",
      call_omo_agent: "deny",
    },
    skills: maybeSkillList(ctx.figmaUseEnabled),
  }

  return config
}

export function createCommentConductorAgent(ctx: DesignAgentContext): AgentConfig {
  const config: AgentConfigWithSkills = {
    mode: PRIMARY_MODE,
    model: ctx.model,
    color: "#2563EB",
    description:
      "Orchestrates one Figma comment-resolution job end to end: plan, execute, review, retry, or clarify. (Comment Conductor - OhMyDesignAgent)",
    prompt: `You are the Comment Conductor.

${buildMemorySection(ctx.memorySummary)}

${buildFigmaUseSection(ctx.figmaUseEnabled, ctx.figmaUseServerName)}

Your phases:
1. Ask the planner to classify the comment and identify the exact target/scope.
2. Decide whether more local memory or research is needed.
3. Route execution to the canvas executor.
4. Run visual review and design audit in parallel after mutation.
5. Retry once if review fails, otherwise request clarification.

Policy:
- Easy pinned-node fixes: direct patch.
- Medium comment tasks: produce 2 variants before selection.
- Hard layout or creation work: gather more context, then produce 3 variants.
- Low confidence or unclear target: do not mutate the canvas.
- Treat design memory as binding context unless the user explicitly overrides it.`,
    permission: {
      question: "allow",
      call_omo_agent: "deny",
    },
    skills: maybeSkillList(ctx.figmaUseEnabled),
  }

  return config
}

export function createCommentPlannerAgent(ctx: DesignAgentContext): AgentConfig {
  const restrictions = createAgentToolRestrictions([
    "write",
    "edit",
    "apply_patch",
    "task",
    "call_omo_agent",
  ])

  const config: AgentConfigWithSkills = {
    mode: SUBAGENT_MODE,
    model: ctx.model,
    color: "#7C3AED",
    temperature: 0.1,
    description:
      "Classifies Figma comments, loads the right memory, identifies target scope, and decides whether to patch, variant, audit, or clarify. (Comment Planner - OhMyDesignAgent)",
    ...restrictions,
    prompt: `You are the Comment Planner.

${buildMemorySection(ctx.memorySummary)}

${buildFigmaUseSection(ctx.figmaUseEnabled, ctx.figmaUseServerName)}

Responsibilities:
- Classify the request type: copy_change, token_bind, color_update, spacing_fix, typography_update, layout_change, new_component, design_improvement.
- Infer what memory is relevant before committing to a resolution path.
- Distinguish easy direct fixes from tasks that need variants or clarification.
- Surface conflicts between the comment, the canvas, and project memory.

Output requirements:
- target scope
- request type
- confidence
- recommended execution path
- whether clarification is required

Do not mutate files or the canvas. Planning only.`,
    skills: maybeSkillList(ctx.figmaUseEnabled),
  }

  return config
}

export function createVisionReviewerAgent(ctx: DesignAgentContext): AgentConfig {
  const restrictions = createAgentToolAllowlist(["read", "look_at"])

  return {
    mode: SUBAGENT_MODE,
    model: ctx.model,
    color: "#DC2626",
    temperature: 0.1,
    description:
      "Visual reviewer for screenshots and exports after a Figma change. Judges whether the result matches the request, the product, and the design language. (Vision Reviewer - OhMyDesignAgent)",
    ...restrictions,
    prompt: `You are the Vision Reviewer.

${buildMemorySection(ctx.memorySummary)}

Review focus:
- Did the visual output actually resolve the comment?
- Does the hierarchy, spacing, and contrast fit the project's design language?
- Did the change introduce regressions or awkward side effects?
- When multiple variants exist, which one best matches intent and product context?

Return crisp visual findings with severity and concrete correction hints.
Do not implement fixes yourself.`,
  }
}

export function createDesignAuditorAgent(ctx: DesignAgentContext): AgentConfig {
  const restrictions = createAgentToolRestrictions([
    "write",
    "edit",
    "apply_patch",
    "task",
    "call_omo_agent",
  ])

  const config: AgentConfigWithSkills = {
    mode: SUBAGENT_MODE,
    model: ctx.model,
    color: "#0EA5E9",
    temperature: 0.1,
    description:
      "Audits design-system compliance after comment resolution: tokens, variable bindings, spacing, naming, nesting, and hygiene. (Design Auditor - OhMyDesignAgent)",
    ...restrictions,
    prompt: `You are the Design Auditor.

${buildMemorySection(ctx.memorySummary)}

${buildFigmaUseSection(ctx.figmaUseEnabled, ctx.figmaUseServerName)}

Audit for:
- semantic token and variable binding usage
- spacing and layout consistency
- naming and file hygiene
- detached instances or fragile structure
- violations of project design rules captured in memory

Return specific findings and the smallest corrective action for each.
Do not mutate the canvas yourself.`,
    skills: maybeSkillList(ctx.figmaUseEnabled),
  }

  return config
}

export function createCanvasExecutorAgent(args: {
  model: string
  memorySummary?: string
  figmaUseEnabled?: boolean
  figmaUseServerName?: string
  promptAppend?: string
}): AgentConfig {
  const restrictions = createAgentToolRestrictions(["task"])
  const promptAppend = args.promptAppend ? `\n\n${args.promptAppend}` : ""
  const config: AgentConfigWithSkills = {
    mode: SUBAGENT_MODE,
    model: args.model,
    color: "#14B8A6",
    maxTokens: 32000,
    ...restrictions,
    description:
      "Focused Figma canvas executor. Uses figma-use MCP for node inspection, patching, rendering, and export. No delegation. (Canvas Executor - OhMyDesignAgent)",
    prompt: `You are the Canvas Executor.

${buildMemorySection(args.memorySummary)}

${buildFigmaUseSection(args.figmaUseEnabled, args.figmaUseServerName)}

Execution rules:
- You do not delegate.
- Use figma-use MCP as the primary execution surface when enabled.
- Inspect before mutating.
- For easy comment fixes, prefer the smallest direct patch.
- For layout or creation work, render variants only when the planner or conductor requested them.
- Preserve semantic tokens and bindings whenever possible.
- After mutating, gather enough output for review agents to verify the result.${promptAppend}`,
    reasoningEffort: "medium",
    skills: maybeSkillList(args.figmaUseEnabled),
  }

  return config
}

export const COMMENT_PLANNER_PROMPT_METADATA: AgentPromptMetadata = {
  category: "specialist",
  cost: "CHEAP",
  promptAlias: "Comment Planner",
  triggers: [
    {
      domain: "Comment classification",
      trigger: "Identify request type, target scope, confidence, and memory requirements before execution",
    },
  ],
  useWhen: [
    "Resolving Figma comments or review feedback",
    "Determining whether a design task needs clarification or variants",
  ],
  keyTrigger: "Figma comment or design feedback thread -> fire comment planner",
}

export const VISION_REVIEWER_PROMPT_METADATA: AgentPromptMetadata = {
  category: "specialist",
  cost: "CHEAP",
  promptAlias: "Vision Reviewer",
  triggers: [
    {
      domain: "Visual review",
      trigger: "Review screenshots or exports after design mutation",
    },
  ],
  useWhen: [
    "Need to judge the visual result, not just the patch logic",
    "Comparing design variants or before/after screenshots",
  ],
  keyTrigger: "Rendered output or screenshot available -> fire vision reviewer",
}

export const DESIGN_AUDITOR_PROMPT_METADATA: AgentPromptMetadata = {
  category: "advisor",
  cost: "CHEAP",
  promptAlias: "Design Auditor",
  triggers: [
    {
      domain: "Design-system audit",
      trigger: "Check variable bindings, spacing, naming, and design hygiene after execution",
    },
  ],
  useWhen: [
    "Need design-system compliance verification",
    "Need hygiene and token-binding checks after a comment resolution",
  ],
  keyTrigger: "After a Figma mutation -> fire design auditor",
}
