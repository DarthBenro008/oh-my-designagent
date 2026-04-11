import { beforeEach, describe, expect, test } from "bun:test";
import {
  clearScopeTarget,
  createScopeLockHook,
} from "./scope-lock-hook";
import {
  clearDesignIntentState,
  recordApprovedNodeIds,
} from "./design-intent-state";

const SESSION_ID = "test-session";

function createDesignCtx(texts: string[]) {
  return {
    client: {
      session: {
        messages: async () => ({
          data: texts.map((text) => ({
            info: { role: "assistant" },
            parts: [{ type: "text", text }],
          })),
        }),
      },
    },
  } as any;
}

function buildClassificationBlock(args: {
  editIntent?: string;
  requestType?: string;
  targetNode?: string;
  includePlan?: boolean;
  planStatus?: string;
  ownerSessionId?: string;
}): string {
  const lines = [
    "Resolve this Figma comment.",
    "## Classification",
  ];

  if (args.editIntent) {
    lines.push(`- Edit Intent: ${args.editIntent}`);
  }
  if (args.requestType) {
    lines.push(`- Request Type: ${args.requestType}`);
  }
  lines.push("- Difficulty: easy");
  lines.push("- Confidence: 90");
  lines.push("- Routing: proceed");
  lines.push("- Scope Mode: subtree");
  if (args.targetNode) {
    lines.push(`- Target Node: ${args.targetNode}`);
  }

  if (args.includePlan) {
    lines.push(
      "",
      "## Design Plan",
      "- Request ID: req-1",
      "- Source Type: comment",
      ...(args.targetNode ? [`- Target Node: ${args.targetNode}`] : []),
      "- Thread ID: thread-123",
      `- Request Type: ${args.requestType ?? "copy_change"}`,
      `- Edit Intent: ${args.editIntent ?? "text_only"}`,
      "- Difficulty: easy",
      "- Plan Mode: micro",
      "- Created By: Prometheus",
      ...(args.ownerSessionId ? [`- Owner Session ID: ${args.ownerSessionId}`] : []),
      `- Status: ${args.planStatus ?? "ready"}`,
      "",
      "### Mutation Steps",
      "- Apply the approved mutation inside the scoped target",
      "",
      "### Verification Steps",
      "- Export the after screenshot",
      "- Run lint",
      "",
      "### Review Requirements",
      "- Vision Reviewer",
      "- Design Auditor",
    );
  }

  return lines.join("\n");
}

describe("createScopeLockHook", () => {
  beforeEach(() => {
    clearScopeTarget(SESSION_ID);
    clearDesignIntentState(SESSION_ID);
  });

  test("ignores non-bash tools", async () => {
    const hook = createScopeLockHook(createDesignCtx([]));

    await expect(
      hook["tool.execute.before"](
        { tool: "read", sessionID: SESSION_ID, callID: "c1" },
        { args: { command: 'figma-daemon set fill 1:23 "#FF0000"' } } as any,
      ),
    ).resolves.toBeUndefined();
  });

  test("requires a design plan artifact before design mutations", async () => {
    const hook = createScopeLockHook(
      createDesignCtx([
        "Resolve this Figma comment.\n## Target\n- Node: `1:23`",
      ]),
    );

    await expect(
      hook["tool.execute.before"](
        { tool: "bash", sessionID: SESSION_ID, callID: "c1" },
        { args: { command: 'figma-daemon set fill 1:23 "#FF0000"' } } as any,
      ),
    ).rejects.toThrow("Design Plan");
  });

  test("treats figma-daemon diff apply as a guarded mutation", async () => {
    const hook = createScopeLockHook(
      createDesignCtx([
        "Resolve this Figma comment.\n## Target\n- Node: `1:23`",
      ]),
    );

    await expect(
      hook["tool.execute.before"](
        { tool: "bash", sessionID: SESSION_ID, callID: "c1" },
        { args: { command: "figma-daemon diff apply /tmp/patch.json" } } as any,
      ),
    ).rejects.toThrow("Design Plan");
  });

  test("allows text-only mutations on existing text nodes", async () => {
    const hook = createScopeLockHook(
      createDesignCtx([
        buildClassificationBlock({
          editIntent: "text_only",
          requestType: "copy_change",
          targetNode: "1:23",
          includePlan: true,
        }),
      ]),
    );

    await expect(
      hook["tool.execute.before"](
        { tool: "bash", sessionID: SESSION_ID, callID: "c1" },
        { args: { command: 'figma-daemon set text 1:23 "Updated copy"' } } as any,
      ),
    ).resolves.toBeUndefined();
  });

  test("blocks mutations when the design plan is not ready", async () => {
    const hook = createScopeLockHook(
      createDesignCtx([
        buildClassificationBlock({
          editIntent: "text_only",
          requestType: "copy_change",
          targetNode: "1:23",
          includePlan: true,
          planStatus: "clarify",
        }),
      ]),
    );

    await expect(
      hook["tool.execute.before"](
        { tool: "bash", sessionID: SESSION_ID, callID: "c1" },
        { args: { command: 'figma-daemon set text 1:23 "Updated copy"' } } as any,
      ),
    ).rejects.toThrow("status must be `ready`");
  });

  test("allows mutations when the design plan is approved for execution", async () => {
    const hook = createScopeLockHook(
      createDesignCtx([
        buildClassificationBlock({
          editIntent: "text_only",
          requestType: "copy_change",
          targetNode: "1:23",
          includePlan: true,
          planStatus: "approved-for-execution",
        }),
      ]),
    );

    await expect(
      hook["tool.execute.before"](
        { tool: "bash", sessionID: SESSION_ID, callID: "c1" },
        { args: { command: 'figma-daemon set text 1:23 "Updated copy"' } } as any,
      ),
    ).resolves.toBeUndefined();
  });


  test("blocks mutations when the design plan owner is outside the active lineage", async () => {
    const hook = createScopeLockHook(
      createDesignCtx([
        buildClassificationBlock({
          editIntent: "text_only",
          requestType: "copy_change",
          targetNode: "1:23",
          includePlan: true,
          ownerSessionId: "ses-other",
        }),
      ]),
    );

    await expect(
      hook["tool.execute.before"](
        { tool: "bash", sessionID: SESSION_ID, callID: "c1" },
        { args: { command: 'figma-daemon set text 1:23 "Updated copy"' } } as any,
      ),
    ).rejects.toThrow("ownership mismatch");
  });

  test("blocks frame mutations for text-only intent", async () => {
    const hook = createScopeLockHook(
      createDesignCtx([
        buildClassificationBlock({
          editIntent: "text_only",
          requestType: "copy_change",
          targetNode: "1:23",
          includePlan: true,
        }),
      ]),
    );

    await expect(
      hook["tool.execute.before"](
        { tool: "bash", sessionID: SESSION_ID, callID: "c1" },
        { args: { command: 'figma-daemon set fill 1:23 "#FF0000"' } } as any,
      ),
    ).rejects.toThrow("text_only intent");
  });

  test("allows non-structural property edits for frame-props-only intent", async () => {
    const hook = createScopeLockHook(
      createDesignCtx([
        buildClassificationBlock({
          editIntent: "frame_props_only",
          requestType: "color_update",
          targetNode: "1:23",
          includePlan: true,
        }),
      ]),
    );

    await expect(
      hook["tool.execute.before"](
        { tool: "bash", sessionID: SESSION_ID, callID: "c1" },
        { args: { command: 'figma-daemon set fill 1:23 "$color.primary"' } } as any,
      ),
    ).resolves.toBeUndefined();
  });

  test("blocks text edits for frame-props-only intent", async () => {
    const hook = createScopeLockHook(
      createDesignCtx([
        buildClassificationBlock({
          editIntent: "frame_props_only",
          requestType: "spacing_fix",
          targetNode: "1:23",
          includePlan: true,
        }),
      ]),
    );

    await expect(
      hook["tool.execute.before"](
        { tool: "bash", sessionID: SESSION_ID, callID: "c1" },
        { args: { command: 'figma-daemon set text 1:23 "Nope"' } } as any,
      ),
    ).rejects.toThrow("frame_props_only intent");
  });

  test("allows cloning the original target for create-variants intent", async () => {
    const hook = createScopeLockHook(
      createDesignCtx([
        buildClassificationBlock({
          editIntent: "create_variants",
          requestType: "design_improvement",
          targetNode: "1:23",
          includePlan: true,
        }),
      ]),
    );

    await expect(
      hook["tool.execute.before"](
        { tool: "bash", sessionID: SESSION_ID, callID: "c1" },
        { args: { command: 'figma-daemon node clone 1:23 --x 300 --y 0' } } as any,
      ),
    ).resolves.toBeUndefined();
  });

  test("blocks edits to the original target after variant clones are approved", async () => {
    const hook = createScopeLockHook(
      createDesignCtx([
        buildClassificationBlock({
          editIntent: "create_variants",
          requestType: "design_improvement",
          targetNode: "1:23",
          includePlan: true,
        }),
      ]),
    );

    recordApprovedNodeIds(SESSION_ID, ["2:22"], { variantClones: true });

    await expect(
      hook["tool.execute.before"](
        { tool: "bash", sessionID: SESSION_ID, callID: "c1" },
        { args: { command: 'figma-daemon node rename 1:23 "Original edited"' } } as any,
      ),
    ).rejects.toThrow("Only approved variant clones may be mutated");
  });

  test("allows edits on approved clone ids for create-variants intent", async () => {
    const hook = createScopeLockHook(
      createDesignCtx([
        buildClassificationBlock({
          editIntent: "create_variants",
          requestType: "design_improvement",
          targetNode: "1:23",
          includePlan: true,
        }),
      ]),
    );

    recordApprovedNodeIds(SESSION_ID, ["2:22"], { variantClones: true });

    await expect(
      hook["tool.execute.before"](
        { tool: "bash", sessionID: SESSION_ID, callID: "c1" },
        { args: { command: 'figma-daemon node rename 2:22 "Variant A"' } } as any,
      ),
    ).resolves.toBeUndefined();
  });
});
