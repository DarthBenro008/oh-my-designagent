import type {
  CommentDifficulty,
  CommentEditIntent,
  CommentRequestType,
} from "./comment-classification";

export type DesignPlanSourceType = "comment" | "direct-design-task";
export type DesignPlanMode = "micro" | "full";
export type DesignPlanStatus =
  | "draft"
  | "ready"
  | "approved-for-execution"
  | "executing"
  | "reviewed"
  | "replied"
  | "clarify"
  | "complete";

export interface DesignPlanArtifact {
  requestId: string;
  schemaVersion?: number;
  planVersion?: number;
  retryOfRequestId?: string;
  sourceType: DesignPlanSourceType;
  targetNodeId?: string;
  threadId?: string;
  requestType: CommentRequestType;
  editIntent: CommentEditIntent;
  difficulty: CommentDifficulty;
  planMode: DesignPlanMode;
  mutationSteps: string[];
  verificationSteps: string[];
  reviewRequirements: string[];
  memoryContextRefs: string[];
  createdByAgent: string;
  ownerSessionId?: string;
  ownerRootSessionId?: string;
  ownerLaneId?: string;
  status: DesignPlanStatus;
}

function extractSection(block: string, title: string): string | undefined {
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(
    new RegExp(
      `###\\s+${escapedTitle}\\n([\\s\\S]*?)(?=\\n###\\s+|\\n##\\s+|$)`,
      "i",
    ),
  );

  return match?.[1]?.trim();
}

function extractScalar(block: string, label: string): string | undefined {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(
    new RegExp(`-\\s*${escapedLabel}:\\s*([^\\n]+)`, "i"),
  );
  return match?.[1]?.trim();
}

function extractList(block: string, title: string): string[] {
  const section = extractSection(block, title);
  if (!section) {
    return [];
  }

  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function parsePositiveInteger(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return undefined;
  }

  return parsed;
}

function isRequestType(value?: string): value is CommentRequestType {
  return value !== undefined
    && [
      "copy_change",
      "token_bind",
      "color_update",
      "spacing_fix",
      "typography_update",
      "layout_change",
      "new_component",
      "design_improvement",
    ].includes(value);
}

function isEditIntent(value?: string): value is CommentEditIntent {
  return value !== undefined
    && [
      "full_redesign",
      "text_only",
      "frame_props_only",
      "create_variants",
    ].includes(value);
}

function isDifficulty(value?: string): value is CommentDifficulty {
  return value !== undefined
    && ["skip", "easy", "medium", "hard"].includes(value);
}

function isSourceType(value?: string): value is DesignPlanSourceType {
  return value !== undefined
    && ["comment", "direct-design-task"].includes(value);
}

function isPlanMode(value?: string): value is DesignPlanMode {
  return value !== undefined && ["micro", "full"].includes(value);
}

function isPlanStatus(value?: string): value is DesignPlanStatus {
  return value !== undefined
    && [
      "draft",
      "ready",
      "approved-for-execution",
      "executing",
      "reviewed",
      "replied",
      "clarify",
      "complete",
    ].includes(value);
}

function extractBlock(text: string): string | undefined {
  const match = text.match(/## Design Plan([\s\S]*?)(?=\n##\s+|$)/i);
  return match ? `## Design Plan${match[1]}`.trim() : undefined;
}

export function parseDesignPlanBlock(
  text: string,
): DesignPlanArtifact | undefined {
  const block = extractBlock(text);
  if (!block) {
    return undefined;
  }

  const requestId = extractScalar(block, "Request ID");
  const sourceType = extractScalar(block, "Source Type");
  const requestType = extractScalar(block, "Request Type");
  const editIntent = extractScalar(block, "Edit Intent");
  const difficulty = extractScalar(block, "Difficulty");
  const planMode = extractScalar(block, "Plan Mode");
  const createdByAgent = extractScalar(block, "Created By");
  const status = extractScalar(block, "Status");

  if (
    !requestId
    || !isSourceType(sourceType)
    || !isRequestType(requestType)
    || !isEditIntent(editIntent)
    || !isDifficulty(difficulty)
    || !isPlanMode(planMode)
    || !createdByAgent
    || !isPlanStatus(status)
  ) {
    return undefined;
  }

  const mutationSteps = extractList(block, "Mutation Steps");
  const verificationSteps = extractList(block, "Verification Steps");
  const reviewRequirements = extractList(block, "Review Requirements");

  if (
    mutationSteps.length === 0
    || verificationSteps.length === 0
    || reviewRequirements.length === 0
  ) {
    return undefined;
  }

  return {
    requestId,
    schemaVersion: parsePositiveInteger(extractScalar(block, "Schema Version")),
    planVersion: parsePositiveInteger(extractScalar(block, "Plan Version")),
    retryOfRequestId: extractScalar(block, "Retry Of Request ID"),
    sourceType,
    targetNodeId: extractScalar(block, "Target Node"),
    threadId: extractScalar(block, "Thread ID"),
    requestType,
    editIntent,
    difficulty,
    planMode,
    mutationSteps,
    verificationSteps,
    reviewRequirements,
    memoryContextRefs: extractList(block, "Memory Context Refs"),
    createdByAgent,
    ownerSessionId: extractScalar(block, "Owner Session ID"),
    ownerRootSessionId: extractScalar(block, "Owner Root Session ID"),
    ownerLaneId: extractScalar(block, "Owner Lane ID"),
    status,
  };
}

export function extractLatestDesignPlan(
  texts: string[],
  options?: {
    ownerSessionIds?: Iterable<string>;
    ownerSessionId?: string;
  },
): DesignPlanArtifact | undefined {
  let latestPlan: DesignPlanArtifact | undefined;
  const ownerSessionIds = options?.ownerSessionIds
    ? new Set(options.ownerSessionIds)
    : undefined;
  const requestVersionCounts = new Map<string, number>();

  for (const text of texts) {
    const parsed = parseDesignPlanBlock(text);
    if (!parsed) {
      continue;
    }

    if (ownerSessionIds) {
      const matchesOwner = !parsed.ownerSessionId
        && !parsed.ownerRootSessionId
        || (parsed.ownerSessionId
          ? ownerSessionIds.has(parsed.ownerSessionId)
          : false)
        || (parsed.ownerRootSessionId
          ? ownerSessionIds.has(parsed.ownerRootSessionId)
          : false);
      if (!matchesOwner) {
        continue;
      }
    }

    const inferredPlanVersion =
      parsed.planVersion
      ?? ((requestVersionCounts.get(parsed.requestId) ?? 0) + 1);

    requestVersionCounts.set(parsed.requestId, inferredPlanVersion);
    latestPlan = {
      ...parsed,
      schemaVersion: parsed.schemaVersion ?? 1,
      planVersion: inferredPlanVersion,
      ownerSessionId: parsed.ownerSessionId ?? options?.ownerSessionId,
    };
  }

  return latestPlan;
}

export function isExecutableDesignPlanStatus(
  status: DesignPlanStatus,
): boolean {
  return status === "ready" || status === "approved-for-execution";
}

export function buildDesignPlanBlock(plan: DesignPlanArtifact): string {
  const lines = [
    "## Design Plan",
    `- Request ID: ${plan.requestId}`,
  ];

  if (plan.schemaVersion !== undefined) {
    lines.push(`- Schema Version: ${plan.schemaVersion}`);
  }
  if (plan.planVersion !== undefined) {
    lines.push(`- Plan Version: ${plan.planVersion}`);
  }
  if (plan.retryOfRequestId) {
    lines.push(`- Retry Of Request ID: ${plan.retryOfRequestId}`);
  }

  lines.push(
    `- Source Type: ${plan.sourceType}`,
  );

  if (plan.targetNodeId) {
    lines.push(`- Target Node: ${plan.targetNodeId}`);
  }
  if (plan.threadId) {
    lines.push(`- Thread ID: ${plan.threadId}`);
  }

  lines.push(
    `- Request Type: ${plan.requestType}`,
    `- Edit Intent: ${plan.editIntent}`,
    `- Difficulty: ${plan.difficulty}`,
    `- Plan Mode: ${plan.planMode}`,
    `- Created By: ${plan.createdByAgent}`,
  );

  if (plan.ownerSessionId) {
    lines.push(`- Owner Session ID: ${plan.ownerSessionId}`);
  }
  if (plan.ownerRootSessionId) {
    lines.push(`- Owner Root Session ID: ${plan.ownerRootSessionId}`);
  }
  if (plan.ownerLaneId) {
    lines.push(`- Owner Lane ID: ${plan.ownerLaneId}`);
  }

  lines.push(
    `- Status: ${plan.status}`,
    "",
    "### Mutation Steps",
    ...plan.mutationSteps.map((step) => `- ${step}`),
    "",
    "### Verification Steps",
    ...plan.verificationSteps.map((step) => `- ${step}`),
    "",
    "### Review Requirements",
    ...plan.reviewRequirements.map((step) => `- ${step}`),
  );

  if (plan.memoryContextRefs.length > 0) {
    lines.push(
      "",
      "### Memory Context Refs",
      ...plan.memoryContextRefs.map((ref) => `- ${ref}`),
    );
  }

  return lines.join("\n");
}
