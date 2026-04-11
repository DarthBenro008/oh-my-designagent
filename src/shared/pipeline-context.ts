import type { CommentClassification } from "./comment-classification";
import {
  buildDesignPlanBlock,
  type DesignPlanArtifact,
} from "./design-plan";

export interface CommentData {
  id: string;
  message: string;
  author: string;
  nodeId?: string;
  nodeOffset?: { x: number; y: number };
  threadId: string;
  isReply: boolean;
}

export interface PreGatheredContext {
  daemonStatus: string;
  nodeTree?: string;
  nodeJsx?: string;
  nodeBindings?: string;
  screenshotPath?: string;
  designTokensSummary?: string;
  commentData: CommentData;
}

export interface PipelineContext {
  classification?: CommentClassification;
  designPlan?: DesignPlanArtifact;
  preGathered: PreGatheredContext;
  plannerOutput?: string;
  executorOutput?: string;
  reviewerOutput?: string;
  auditorOutput?: string;
}

function formatSection(title: string, lines: string[]): string {
  return [`## ${title}`, ...lines].join("\n");
}

function pushIfPresent(lines: string[], label: string, value?: string): void {
  if (value) {
    lines.push(`- ${label}: ${value}`);
  }
}

export function buildClassificationBlock(
  classification: CommentClassification,
): string {
  const lines = [
    `- Edit Intent: ${classification.editIntent}`,
    `- Request Type: ${classification.requestType}`,
    `- Difficulty: ${classification.difficulty}`,
    `- Confidence: ${classification.confidence}`,
    `- Routing: ${classification.routing}`,
    `- Scope Mode: ${classification.scopeMode}`,
    `- Target Node: ${classification.targetNodeId ?? "none"}`,
  ];

  return formatSection("Classification", lines);
}

function buildCommentDataSection(commentData: CommentData): string {
  const lines = [
    `- ID: ${commentData.id}`,
    `- Author: ${commentData.author}`,
    `- Message: ${commentData.message}`,
    `- Thread ID: ${commentData.threadId}`,
    `- Is Reply: ${commentData.isReply ? "yes" : "no"}`,
  ];

  pushIfPresent(lines, "Node ID", commentData.nodeId);
  if (commentData.nodeOffset) {
    lines.push(
      `- Node Offset: ${commentData.nodeOffset.x}, ${commentData.nodeOffset.y}`,
    );
  }

  return formatSection("Comment Data", lines);
}

function buildPreGatheredSection(ctx: PreGatheredContext): string {
  const lines = [`- Daemon Status: ${ctx.daemonStatus}`];

  pushIfPresent(lines, "Node Tree", ctx.nodeTree);
  pushIfPresent(lines, "Node JSX", ctx.nodeJsx);
  pushIfPresent(lines, "Node Bindings", ctx.nodeBindings);
  pushIfPresent(lines, "Screenshot Path", ctx.screenshotPath);
  pushIfPresent(lines, "Design Tokens Summary", ctx.designTokensSummary);

  return formatSection("Pre-Gathered Context", lines);
}

function buildOutputSection(
  title: string,
  output?: string,
): string | undefined {
  return output ? formatSection(title, [output]) : undefined;
}

export function buildDelegationPrompt(
  ctx: PipelineContext,
  targetAgent: string,
): string {
  const sections = [
    buildCommentDataSection(ctx.preGathered.commentData),
    buildPreGatheredSection(ctx.preGathered),
  ];

  if (ctx.classification) {
    sections.push(buildClassificationBlock(ctx.classification));
  }
  if (ctx.designPlan) {
    sections.push(buildDesignPlanBlock(ctx.designPlan));
  }

  const plannerSection = buildOutputSection(
    "Planner Output",
    ctx.plannerOutput,
  );
  if (plannerSection) sections.push(plannerSection);

  const executorSection = buildOutputSection(
    "Executor Output",
    ctx.executorOutput,
  );
  if (executorSection) sections.push(executorSection);

  const reviewerSection = buildOutputSection(
    "Reviewer Output",
    ctx.reviewerOutput,
  );
  if (reviewerSection) sections.push(reviewerSection);

  const auditorSection = buildOutputSection(
    "Auditor Output",
    ctx.auditorOutput,
  );
  if (auditorSection) sections.push(auditorSection);

  sections.push(`You are acting as: ${targetAgent}`);

  return sections.join("\n\n");
}
