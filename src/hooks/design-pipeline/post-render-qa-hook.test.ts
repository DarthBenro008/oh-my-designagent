import { beforeEach, describe, expect, test } from "bun:test";
import {
  clearMutationFlag,
  createPostRenderQaHook,
  hasPendingMutation,
} from "./post-render-qa-hook";
import { clearDesignIntentState } from "./design-intent-state";

const SESSION_ID = "test-session";

function createDesignCtx(threadId?: string) {
  const text = threadId
    ? `Resolve this Figma comment.\n## Comment Data\n- Thread ID: ${threadId}`
    : "Resolve this Figma comment.";

  return {
    client: {
      session: {
        messages: async () => ({
          data: [
            {
              info: { role: "assistant" },
              parts: [{ type: "text", text }],
            },
          ],
        }),
      },
    },
  } as any;
}

async function runBashCommand(
  hook: ReturnType<typeof createPostRenderQaHook>,
  args: {
    callID: string;
    command: string;
    output?: string;
  },
): Promise<void> {
  await hook["tool.execute.before"](
    { tool: "bash", sessionID: SESSION_ID, callID: args.callID },
    { args: { command: args.command } } as any,
  );

  await hook["tool.execute.after"](
    { tool: "bash", sessionID: SESSION_ID, callID: args.callID },
    {
      title: "ok",
      output: args.output ?? "",
      metadata: {},
    },
  );
}

describe("createPostRenderQaHook", () => {
  beforeEach(() => {
    clearMutationFlag(SESSION_ID);
    clearDesignIntentState(SESSION_ID);
  });

  test("ignores non-bash tool executions", async () => {
    const hook = createPostRenderQaHook({} as any);

    await expect(
      hook["tool.execute.after"](
        { tool: "read", sessionID: SESSION_ID, callID: "c1" },
        { title: "ok", output: "", metadata: {} },
      ),
    ).resolves.toBeUndefined();

    expect(hasPendingMutation(SESSION_ID)).toBe(false);
  });

  test("tracks pending QA after a canvas mutation", async () => {
    const hook = createPostRenderQaHook({} as any);

    await runBashCommand(hook, {
      callID: "c1",
      command: 'figma-daemon set fill 1:23 "#FF0000"',
      output: '{"id":"1:23"}',
    });

    expect(hasPendingMutation(SESSION_ID)).toBe(true);
  });

  test("clears pending QA only after export, lint, and bindings verification", async () => {
    const hook = createPostRenderQaHook({} as any);

    await runBashCommand(hook, {
      callID: "c1",
      command: 'figma-daemon set fill 1:23 "#FF0000"',
      output: '{"id":"1:23"}',
    });
    expect(hasPendingMutation(SESSION_ID)).toBe(true);

    await runBashCommand(hook, {
      callID: "c2",
      command: "figma-daemon export node 1:23 --output /tmp/after.png",
    });
    expect(hasPendingMutation(SESSION_ID)).toBe(true);

    await runBashCommand(hook, {
      callID: "c3",
      command: "figma-daemon lint --root 1:23 -v",
    });
    expect(hasPendingMutation(SESSION_ID)).toBe(true);

    await runBashCommand(hook, {
      callID: "c4",
      command: "figma-daemon node bindings 1:23",
    });
    expect(hasPendingMutation(SESSION_ID)).toBe(false);
  });

  test("blocks comment replies before verification is complete", async () => {
    const hook = createPostRenderQaHook({} as any);

    await runBashCommand(hook, {
      callID: "c1",
      command: 'figma-daemon set fill 1:23 "#FF0000"',
      output: '{"id":"1:23"}',
    });

    await expect(
      hook["tool.execute.before"](
        { tool: "bash", sessionID: SESSION_ID, callID: "c2" },
        {
          args: {
            command: 'figma-daemon comment add "done" --reply 123',
          },
        } as any,
      ),
    ).rejects.toThrow("POST-RENDER QA");
  });

  test("allows comment replies after verification is complete", async () => {
    const hook = createPostRenderQaHook({} as any);

    await runBashCommand(hook, {
      callID: "c1",
      command: 'figma-daemon set fill 1:23 "#FF0000"',
      output: '{"id":"1:23"}',
    });
    await runBashCommand(hook, {
      callID: "c2",
      command: "figma-daemon export node 1:23 --output /tmp/after.png",
    });
    await runBashCommand(hook, {
      callID: "c3",
      command: "figma-daemon lint --root 1:23 -v",
    });
    await runBashCommand(hook, {
      callID: "c4",
      command: "figma-daemon node bindings 1:23",
    });

    await expect(
      hook["tool.execute.before"](
        { tool: "bash", sessionID: SESSION_ID, callID: "c5" },
        {
          args: {
            command: 'figma-daemon comment add "done" --reply 123',
          },
        } as any,
      ),
    ).resolves.toBeUndefined();
  });

  test("blocks detached comments when a thread id is known", async () => {
    const hook = createPostRenderQaHook(createDesignCtx("thread-123"));

    await expect(
      hook["tool.execute.before"](
        { tool: "bash", sessionID: SESSION_ID, callID: "c1" },
        {
          args: {
            command: 'figma-daemon comment add "done"',
          },
        } as any,
      ),
    ).rejects.toThrow("THREAD-REPLY");
  });

  test("blocks replies to the wrong thread id", async () => {
    const hook = createPostRenderQaHook(createDesignCtx("thread-123"));

    await expect(
      hook["tool.execute.before"](
        { tool: "bash", sessionID: SESSION_ID, callID: "c1" },
        {
          args: {
            command: 'figma-daemon comment add "done" --reply wrong-thread',
          },
        } as any,
      ),
    ).rejects.toThrow("wrong thread");
  });

  test("blocks comment resolve for design comment sessions", async () => {
    const hook = createPostRenderQaHook(createDesignCtx("thread-123"));

    await expect(
      hook["tool.execute.before"](
        { tool: "bash", sessionID: SESSION_ID, callID: "c1" },
        {
          args: {
            command: "figma-daemon comment resolve thread-123",
          },
        } as any,
      ),
    ).rejects.toThrow("leaves Figma comments open");
  });

  test("blocks comment resolve after a correct reply is posted to the thread", async () => {
    const hook = createPostRenderQaHook(createDesignCtx("thread-123"));

    await runBashCommand(hook, {
      callID: "c1",
      command: 'figma-daemon comment add "done" --reply thread-123',
      output: '{"id":"reply-1","parent_id":"thread-123"}',
    });

    await expect(
      hook["tool.execute.before"](
        { tool: "bash", sessionID: SESSION_ID, callID: "c2" },
        {
          args: {
            command: "figma-daemon comment resolve thread-123",
          },
        } as any,
      ),
    ).rejects.toThrow("do not resolve");
  });
});
