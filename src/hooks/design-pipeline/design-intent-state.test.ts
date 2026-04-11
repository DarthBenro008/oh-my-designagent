import { describe, expect, test } from "bun:test";
import {
  clearDesignIntentState,
  resolveDesignIntentState,
} from "./design-intent-state";

function createSessionTextMap(entries: Record<string, string[]>) {
  return Object.fromEntries(
    Object.entries(entries).map(([sessionID, texts]) => [
      sessionID,
      texts.map((text) => ({
        info: { role: "assistant" },
        parts: [{ type: "text", text }],
      })),
    ]),
  );
}

function createCtx(args: {
  messages: Record<string, Array<{ info: { role: string }; parts: Array<{ type: string; text: string }> }>>;
  parents?: Record<string, string | undefined>;
}) {
  return {
    client: {
      session: {
        messages: async ({ path }: { path: { id: string } }) => ({
          data: args.messages[path.id] ?? [],
        }),
        get: async ({ path }: { path: { id: string } }) => ({
          data: { parentID: args.parents?.[path.id] },
        }),
      },
    },
  } as any;
}

describe("resolveDesignIntentState", () => {
  test("treats direct design tasks as design sessions and infers owner/version metadata", async () => {
    clearDesignIntentState("ses-direct");

    const ctx = createCtx({
      messages: createSessionTextMap({
        "ses-direct": [
          [
            "Resolve this design task.",
            "## Direct Design Task",
            "- Target Node: 1:23",
            "",
            "## Design Plan",
            "- Request ID: req-direct",
            "- Source Type: direct-design-task",
            "- Target Node: 1:23",
            "- Request Type: design_improvement",
            "- Edit Intent: full_redesign",
            "- Difficulty: medium",
            "- Plan Mode: full",
            "- Created By: Prometheus",
            "- Status: approved-for-execution",
            "",
            "### Mutation Steps",
            "- Improve the layout hierarchy",
            "",
            "### Verification Steps",
            "- Export the node",
            "",
            "### Review Requirements",
            "- Design Auditor",
          ].join("\n"),
        ],
      }),
    });

    const state = await resolveDesignIntentState(ctx, "ses-direct");

    expect(state.isDesignSession).toBe(true);
    expect(state.designPlan).toMatchObject({
      sourceType: "direct-design-task",
      ownerSessionId: "ses-direct",
      planVersion: 1,
      schemaVersion: 1,
      status: "approved-for-execution",
    });
    expect(state.planAccessSessionIds.has("ses-direct")).toBe(true);
  });

  test("inherits parent-session plan ownership across the active lineage", async () => {
    clearDesignIntentState("ses-child");
    clearDesignIntentState("ses-parent");

    const ctx = createCtx({
      parents: { "ses-child": "ses-parent" },
      messages: createSessionTextMap({
        "ses-child": ["Follow the structured design pipeline\n## Target\n- Node: 1:23"],
        "ses-parent": [
          [
            "Resolve this Figma comment.",
            "## Design Plan",
            "- Request ID: req-parent",
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
            "- Update the label",
            "",
            "### Verification Steps",
            "- Export the node",
            "",
            "### Review Requirements",
            "- Vision Reviewer",
          ].join("\n"),
        ],
      }),
    });

    const state = await resolveDesignIntentState(ctx, "ses-child");

    expect(state.designPlan).toMatchObject({
      requestId: "req-parent",
      ownerSessionId: "ses-parent",
    });
    expect(state.planAccessSessionIds.has("ses-child")).toBe(true);
    expect(state.planAccessSessionIds.has("ses-parent")).toBe(true);
  });
});
