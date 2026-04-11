import { describe, expect, test } from "bun:test";
import {
  buildClassificationBlock,
  buildDelegationPrompt,
} from "./pipeline-context";
import type { CommentClassification } from "./comment-classification";
import type { DesignPlanArtifact } from "./design-plan";

describe("buildClassificationBlock", () => {
  describe("#given a classification", () => {
    test("#when called #then returns formatted block", () => {
      const classification: CommentClassification = {
        editIntent: "frame_props_only",
        requestType: "color_update",
        difficulty: "easy",
        confidence: 85,
        routing: "proceed",
        scopeMode: "subtree",
        targetNodeId: "1:23",
      };

      const result = buildClassificationBlock(classification);

      expect(result).toContain("Edit Intent: frame_props_only");
      expect(result).toContain("Request Type: color_update");
      expect(result).toContain("Difficulty: easy");
      expect(result).toContain("Confidence: 85");
      expect(result).toContain("Routing: proceed");
      expect(result).toContain("Scope Mode: subtree");
      expect(result).toContain("Target Node: 1:23");
    });
  });
});

describe("buildDelegationPrompt", () => {
  describe("#given pre-gathered context only", () => {
    test("#when called #then includes comment data and target agent", () => {
      const result = buildDelegationPrompt(
        {
          preGathered: {
            daemonStatus: "ready",
            commentData: {
              id: "comment-1",
              message: "Please update the color",
              author: "Ada",
              threadId: "thread-1",
              isReply: false,
            },
          },
        },
        "canvas-executor",
      );

      expect(result).toContain("Please update the color");
      expect(result).toContain("You are acting as: canvas-executor");
      expect(result).not.toContain("undefined");
    });
  });

  describe("#given classification and outputs", () => {
    test("#when called #then includes all available sections", () => {
      const designPlan: DesignPlanArtifact = {
        requestId: "req-1",
        sourceType: "comment",
        targetNodeId: "1:23",
        threadId: "thread-2",
        requestType: "color_update",
        editIntent: "frame_props_only",
        difficulty: "easy",
        planMode: "micro",
        mutationSteps: ["Update button fill to the approved token"],
        verificationSteps: ["Run export, lint, and bindings checks"],
        reviewRequirements: ["Vision Reviewer", "Design Auditor"],
        memoryContextRefs: ["design-system.md"],
        createdByAgent: "Prometheus",
        status: "ready",
      };

      const result = buildDelegationPrompt(
        {
          classification: {
            editIntent: "frame_props_only",
            requestType: "color_update",
            difficulty: "easy",
            confidence: 90,
            routing: "proceed",
            scopeMode: "subtree",
          },
          preGathered: {
            daemonStatus: "ready",
            commentData: {
              id: "comment-2",
              message: "Use the brand blue",
              author: "Bea",
              threadId: "thread-2",
              isReply: true,
            },
          },
          designPlan,
          plannerOutput: "Plan: update the primary button color.",
          executorOutput: "Executor: applied color tokens.",
          reviewerOutput: "Reviewer: looks good.",
        },
        "canvas-executor",
      );

      expect(result).toContain("Classification");
      expect(result).toContain("## Design Plan");
      expect(result).toContain("Request ID: req-1");
      expect(result).toContain("Plan Mode: micro");
      expect(result).toContain("Vision Reviewer");
      expect(result).toContain("Plan: update the primary button color.");
      expect(result).toContain("Executor: applied color tokens.");
      expect(result).toContain("Reviewer: looks good.");
      expect(result).toContain("Target Node: none");
    });
  });

  describe("#given missing optional pre-gathered fields", () => {
    test("#when called #then omits undefined values", () => {
      const result = buildDelegationPrompt(
        {
          preGathered: {
            daemonStatus: "ready",
            commentData: {
              id: "comment-3",
              message: "Adjust spacing",
              author: "Cid",
              nodeId: undefined,
              threadId: "thread-3",
              isReply: false,
            },
          },
        },
        "canvas-executor",
      );

      expect(result).not.toContain("undefined");
    });
  });
});
