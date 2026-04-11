import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  DESIGN_PLAN_MIRROR_MARKER,
  syncCanonicalDesignPlansToLegacyPlans,
} from "./design-plan-bridge";

describe("syncCanonicalDesignPlansToLegacyPlans", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `design-plan-bridge-${randomUUID()}`);
    mkdirSync(join(testDir, ".omx", "state"), { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test("creates a legacy markdown mirror from a canonical .omx design plan", () => {
    // given
    const canonicalPath = join(testDir, ".omx", "state", "design-session", "checkout-refresh.json");
    mkdirSync(dirname(canonicalPath), { recursive: true });
    writeFileSync(
      canonicalPath,
      JSON.stringify({
        designPlan: {
          requestId: "checkout-refresh",
          sourceType: "direct-design-task",
          targetNodeId: "node-1",
          threadId: "thread-1",
          requestType: "layout_change",
          editIntent: "full_redesign",
          difficulty: "medium",
          planMode: "full",
          mutationSteps: ["Adjust checkout spacing", "Refresh CTA hierarchy"],
          verificationSteps: ["Export after screenshot", "Run lint"],
          reviewRequirements: ["Vision Reviewer", "Design Auditor"],
          memoryContextRefs: ["memory/checkout.md"],
          createdByAgent: "Prometheus",
          status: "ready",
        },
      }, null, 2),
    );

    // when
    const mirrors = syncCanonicalDesignPlansToLegacyPlans(testDir);

    // then
    expect(mirrors).toHaveLength(1);
    expect(mirrors[0]?.planName).toBe("checkout-refresh");
    expect(existsSync(mirrors[0]!.mirrorPath)).toBe(true);

    const mirrorContent = readFileSync(mirrors[0]!.mirrorPath, "utf8");
    expect(mirrorContent).toContain(DESIGN_PLAN_MIRROR_MARKER);
    expect(mirrorContent).toContain("Legacy/manual compatibility mirror for `/start-work`.");
    expect(mirrorContent).toContain("## Design Plan");
    expect(mirrorContent).toContain("- [ ] Mutation: Adjust checkout spacing");
    expect(mirrorContent).toContain("- [ ] Review: Vision Reviewer");
  });

  test("overrides a stale same-name legacy mirror with canonical .omx content", () => {
    // given
    const canonicalPath = join(testDir, ".omx", "state", "nested", "existing-plan.json");
    mkdirSync(dirname(canonicalPath), { recursive: true });
    mkdirSync(join(testDir, ".sisyphus", "plans"), { recursive: true });
    writeFileSync(join(testDir, ".sisyphus", "plans", "existing-plan.md"), "# stale\n- [ ] old");
    writeFileSync(
      canonicalPath,
      JSON.stringify({
        requestId: "existing-plan",
        sourceType: "comment",
        targetNodeId: "node-9",
        threadId: "thread-9",
        requestType: "spacing_fix",
        editIntent: "frame_props_only",
        difficulty: "easy",
        planMode: "micro",
        mutationSteps: ["Tighten card padding"],
        verificationSteps: ["Check spacing tokens"],
        reviewRequirements: ["Design Auditor"],
        memoryContextRefs: [],
        createdByAgent: "Prometheus",
        status: "ready",
      }, null, 2),
    );

    // when
    const mirrors = syncCanonicalDesignPlansToLegacyPlans(testDir);

    // then
    expect(mirrors).toHaveLength(1);
    const mirrorContent = readFileSync(join(testDir, ".sisyphus", "plans", "existing-plan.md"), "utf8");
    expect(mirrorContent).toContain("Tighten card padding");
    expect(mirrorContent).not.toContain("# stale");
  });

  test("skips draft and clarify canonical plans because they are not executable bridge inputs", () => {
    // given
    const canonicalPath = join(testDir, ".omx", "state", "draft-plan.json");
    writeFileSync(
      canonicalPath,
      JSON.stringify({
        requestId: "draft-plan",
        sourceType: "comment",
        requestType: "copy_change",
        editIntent: "text_only",
        difficulty: "easy",
        planMode: "micro",
        mutationSteps: ["Update label"],
        verificationSteps: ["Read node text"],
        reviewRequirements: ["Vision Reviewer"],
        memoryContextRefs: [],
        createdByAgent: "Prometheus",
        status: "clarify",
      }, null, 2),
    );

    // when
    const mirrors = syncCanonicalDesignPlansToLegacyPlans(testDir);

    // then
    expect(mirrors).toHaveLength(0);
    expect(existsSync(join(testDir, ".sisyphus", "plans", "draft-plan.md"))).toBe(false);
  });
});
