export type CommentRequestType =
  | "copy_change"
  | "token_bind"
  | "color_update"
  | "spacing_fix"
  | "typography_update"
  | "layout_change"
  | "new_component"
  | "design_improvement";

export type CommentDifficulty = "skip" | "easy" | "medium" | "hard";

export type ConfidenceRouting = "proceed" | "retry_with_variants" | "clarify";

export type PipelinePhase = "classify" | "plan" | "execute" | "verify";

export interface CommentClassification {
  requestType: CommentRequestType;
  difficulty: CommentDifficulty;
  confidence: number;
  routing: ConfidenceRouting;
  targetNodeId?: string;
  scopeMode: "node_only" | "subtree";
}

interface TaskTypeProfile {
  difficultyHint: CommentDifficulty;
  scopeMode: "node_only" | "subtree";
  requiresMemory: boolean;
  lensProfile: "full" | "standard" | "light";
}

export const TASK_TYPE_PROFILES: Record<CommentRequestType, TaskTypeProfile> = {
  copy_change: {
    difficultyHint: "easy",
    scopeMode: "node_only",
    requiresMemory: false,
    lensProfile: "light",
  },
  token_bind: {
    difficultyHint: "easy",
    scopeMode: "node_only",
    requiresMemory: false,
    lensProfile: "light",
  },
  color_update: {
    difficultyHint: "easy",
    scopeMode: "subtree",
    requiresMemory: false,
    lensProfile: "light",
  },
  spacing_fix: {
    difficultyHint: "easy",
    scopeMode: "subtree",
    requiresMemory: false,
    lensProfile: "light",
  },
  typography_update: {
    difficultyHint: "medium",
    scopeMode: "subtree",
    requiresMemory: false,
    lensProfile: "standard",
  },
  layout_change: {
    difficultyHint: "medium",
    scopeMode: "subtree",
    requiresMemory: true,
    lensProfile: "standard",
  },
  new_component: {
    difficultyHint: "hard",
    scopeMode: "subtree",
    requiresMemory: true,
    lensProfile: "full",
  },
  design_improvement: {
    difficultyHint: "hard",
    scopeMode: "subtree",
    requiresMemory: true,
    lensProfile: "full",
  },
};

export function getConfidenceRouting(
  score: number,
  thresholds: { proceed: number; retry: number },
): ConfidenceRouting {
  if (score >= thresholds.proceed) {
    return "proceed";
  }

  if (score >= thresholds.retry) {
    return "retry_with_variants";
  }

  return "clarify";
}
