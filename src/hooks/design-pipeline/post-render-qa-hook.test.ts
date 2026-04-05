import { describe, test, expect, beforeEach } from "bun:test";
import {
  createPostRenderQaHook,
  hasPendingMutation,
  clearMutationFlag,
} from "./post-render-qa-hook";

describe("createPostRenderQaHook", () => {
  beforeEach(() => {
    clearMutationFlag("test-session");
  });

  describe("#given a non-bash tool execution", () => {
    test("#when tool.execute.after fires for a non-bash tool #then mutation flag is not set", async () => {
      const hook = createPostRenderQaHook({} as any);
      await hook["tool.execute.after"](
        { tool: "read", sessionID: "test-session", callID: "c1" },
        { args: { command: 'figma-daemon set fill 1:23 "#FF0000"' } } as any,
      );
      expect(hasPendingMutation("test-session")).toBe(false);
    });
  });

  describe("#given bash tool with figma-daemon set command", () => {
    test("#when figma-daemon set fill runs #then hasPendingMutation returns true", async () => {
      const hook = createPostRenderQaHook({} as any);
      await hook["tool.execute.after"](
        { tool: "bash", sessionID: "test-session", callID: "c1" },
        { args: { command: 'figma-daemon set fill 1:23 "#FF0000"' } } as any,
      );
      expect(hasPendingMutation("test-session")).toBe(true);
    });
  });

  describe("#given bash tool with figma-daemon render command", () => {
    test("#when figma-daemon render runs #then hasPendingMutation returns true", async () => {
      const hook = createPostRenderQaHook({} as any);
      await hook["tool.execute.after"](
        { tool: "bash", sessionID: "test-session", callID: "c1" },
        { args: { command: "figma-daemon render --stdin" } } as any,
      );
      expect(hasPendingMutation("test-session")).toBe(true);
    });
  });

  describe("#given bash tool with read-only figma-daemon command", () => {
    test("#when figma-daemon node tree runs #then hasPendingMutation returns false", async () => {
      const hook = createPostRenderQaHook({} as any);
      await hook["tool.execute.after"](
        { tool: "bash", sessionID: "test-session", callID: "c1" },
        { args: { command: "figma-daemon node tree 1:23" } } as any,
      );
      expect(hasPendingMutation("test-session")).toBe(false);
    });
  });

  describe("#given mutation followed by export verification", () => {
    test("#when figma-daemon export node runs after mutation #then hasPendingMutation returns false", async () => {
      const hook = createPostRenderQaHook({} as any);
      await hook["tool.execute.after"](
        { tool: "bash", sessionID: "test-session", callID: "c1" },
        { args: { command: 'figma-daemon set fill 1:23 "#FF0000"' } } as any,
      );
      expect(hasPendingMutation("test-session")).toBe(true);
      await hook["tool.execute.after"](
        { tool: "bash", sessionID: "test-session", callID: "c2" },
        {
          args: {
            command: "figma-daemon export node 1:23 --output /tmp/after.png",
          },
        } as any,
      );
      expect(hasPendingMutation("test-session")).toBe(false);
    });
  });

  describe("#given session.idle with pending mutation", () => {
    test("#when session goes idle #then QA reminder is injected in output.message", async () => {
      const hook = createPostRenderQaHook({} as any);
      await hook["tool.execute.after"](
        { tool: "bash", sessionID: "test-session", callID: "c1" },
        { args: { command: 'figma-daemon set fill 1:23 "#FF0000"' } } as any,
      );
      const output: { message?: string } = {};
      await hook["session.idle"]({ sessionID: "test-session" }, output);
      expect(output.message).toContain("POST-RENDER QA");
    });
  });

  describe("#given session.idle without pending mutation", () => {
    test("#when session goes idle with no pending mutation #then output.message is unchanged", async () => {
      const hook = createPostRenderQaHook({} as any);
      const output: { message?: string } = { message: "existing" };
      await hook["session.idle"]({ sessionID: "test-session" }, output);
      expect(output.message).toBe("existing");
    });
  });

  describe("#given clearMutationFlag called explicitly", () => {
    test("#when clearMutationFlag is called after mutation #then hasPendingMutation returns false", async () => {
      const hook = createPostRenderQaHook({} as any);
      await hook["tool.execute.after"](
        { tool: "bash", sessionID: "test-session", callID: "c1" },
        { args: { command: "figma-daemon create frame 1:1" } } as any,
      );
      expect(hasPendingMutation("test-session")).toBe(true);
      clearMutationFlag("test-session");
      expect(hasPendingMutation("test-session")).toBe(false);
    });
  });
});
