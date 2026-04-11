import { describe, expect, test } from "bun:test";
import {
  buildDesignPlanBlock,
  extractLatestDesignPlan,
  isExecutableDesignPlanStatus,
  parseDesignPlanBlock,
  type DesignPlanArtifact,
} from "./design-plan";

const BASE_PLAN: DesignPlanArtifact = {
  requestId: "req-1",
  schemaVersion: 2,
  planVersion: 3,
  retryOfRequestId: "req-0",
  sourceType: "direct-design-task",
  targetNodeId: "1:23",
  requestType: "design_improvement",
  editIntent: "full_redesign",
  difficulty: "hard",
  planMode: "full",
  mutationSteps: ["Rework the hero layout inside the target frame"],
  verificationSteps: ["Export the after screenshot", "Run lint"],
  reviewRequirements: ["Vision Reviewer", "Design Auditor"],
  memoryContextRefs: ["brand/hero.md"],
  createdByAgent: "Prometheus",
  ownerSessionId: "ses-owner",
  ownerRootSessionId: "ses-root",
  ownerLaneId: "lane-1",
  status: "approved-for-execution",
};

describe("design-plan", () => {
  test("round-trips explicit lifecycle, versioning, and ownership fields", () => {
    const block = buildDesignPlanBlock(BASE_PLAN);
    const parsed = parseDesignPlanBlock(block);

    expect(parsed).toEqual(BASE_PLAN);
  });

  test("infers schema and plan version when older artifacts omit them", () => {
    const firstPlan = [
      "## Design Plan",
      "- Request ID: req-legacy",
      "- Source Type: comment",
      "- Target Node: 1:23",
      "- Thread ID: thread-1",
      "- Request Type: copy_change",
      "- Edit Intent: text_only",
      "- Difficulty: easy",
      "- Plan Mode: micro",
      "- Created By: Prometheus",
      "- Status: ready",
      "",
      "### Mutation Steps",
      "- Update the text",
      "",
      "### Verification Steps",
      "- Export the node",
      "",
      "### Review Requirements",
      "- Vision Reviewer",
    ].join("\n");
    const secondPlan = firstPlan.replace("- Status: ready", "- Status: approved-for-execution");

    const latest = extractLatestDesignPlan([firstPlan, secondPlan], {
      ownerSessionId: "ses-child",
    });

    expect(latest).toMatchObject({
      requestId: "req-legacy",
      schemaVersion: 1,
      planVersion: 2,
      ownerSessionId: "ses-child",
      status: "approved-for-execution",
    });
  });

  test("recognizes executable lifecycle states", () => {
    expect(isExecutableDesignPlanStatus("ready")).toBe(true);
    expect(isExecutableDesignPlanStatus("approved-for-execution")).toBe(true);
    expect(isExecutableDesignPlanStatus("reviewed")).toBe(false);
  });
});
