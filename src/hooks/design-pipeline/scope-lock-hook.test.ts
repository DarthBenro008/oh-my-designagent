import { describe, test, expect, beforeEach } from "bun:test";
import {
  createScopeLockHook,
  setScopeTarget,
  clearScopeTarget,
} from "./scope-lock-hook";

type TestOutput = { args: { command: string }; message: string | undefined };

describe("createScopeLockHook", () => {
  beforeEach(() => {
    clearScopeTarget("test-session");
  });

  describe("#given non-bash tool", () => {
    test("#when tool is not bash #then no warning injected", async () => {
      setScopeTarget("test-session", "1:23");
      const hook = createScopeLockHook({} as any);
      const output = {
        args: { command: 'figma-daemon set fill 5:99 "#FF0000"' },
        message: undefined,
      };
      await hook["tool.execute.before"](
        { tool: "read", sessionID: "test-session", callID: "c1" },
        output as any,
      );
      expect(output.message).toBeUndefined();
    });
  });

  describe("#given bash tool with non-figma command", () => {
    test("#when command does not include figma-daemon mutation #then no warning injected", async () => {
      setScopeTarget("test-session", "1:23");
      const hook = createScopeLockHook({} as any);
      const output = { args: { command: "ls -la" }, message: undefined };
      await hook["tool.execute.before"](
        { tool: "bash", sessionID: "test-session", callID: "c1" },
        output as any,
      );
      expect(output.message).toBeUndefined();
    });
  });

  describe("#given bash tool with figma-daemon read command", () => {
    test("#when command is figma-daemon node tree (not a mutation) #then no warning injected", async () => {
      setScopeTarget("test-session", "1:23");
      const hook = createScopeLockHook({} as any);
      const output = {
        args: { command: "figma-daemon node tree 1:23" },
        message: undefined,
      };
      await hook["tool.execute.before"](
        { tool: "bash", sessionID: "test-session", callID: "c1" },
        output as any,
      );
      expect(output.message).toBeUndefined();
    });
  });

  describe("#given scope target set and mutation command for different node", () => {
    test("#when figma-daemon set targets different node #then warning injected", async () => {
      setScopeTarget("test-session", "1:23");
      const hook = createScopeLockHook({} as any);
      const output: TestOutput = {
        args: { command: 'figma-daemon set fill 5:99 "#FF0000"' },
        message: undefined,
      };
      await hook["tool.execute.before"](
        { tool: "bash", sessionID: "test-session", callID: "c1" },
        output as any,
      );
      expect(output.message).toBeDefined();
      expect(output.message).toContain("SCOPE-LOCK");
      expect(output.message).toContain("5:99");
      expect(output.message).toContain("1:23");
    });
  });

  describe("#given scope target set and mutation command for same node", () => {
    test("#when figma-daemon set targets the scope target node #then no warning injected", async () => {
      setScopeTarget("test-session", "1:23");
      const hook = createScopeLockHook({} as any);
      const output = {
        args: { command: 'figma-daemon set fill 1:23 "#FF0000"' },
        message: undefined,
      };
      await hook["tool.execute.before"](
        { tool: "bash", sessionID: "test-session", callID: "c1" },
        output as any,
      );
      expect(output.message).toBeUndefined();
    });
  });

  describe("#given no scope target set", () => {
    test("#when mutation command runs without scope target #then no warning injected", async () => {
      const hook = createScopeLockHook({} as any);
      const output = {
        args: { command: 'figma-daemon set fill 5:99 "#FF0000"' },
        message: undefined,
      };
      await hook["tool.execute.before"](
        { tool: "bash", sessionID: "test-session", callID: "c1" },
        output as any,
      );
      expect(output.message).toBeUndefined();
    });
  });

  describe("#given output.message already has content", () => {
    test("#when warning is injected #then it is appended not replaced", async () => {
      setScopeTarget("test-session", "1:23");
      const hook = createScopeLockHook({} as any);
      const output = {
        args: { command: 'figma-daemon set fill 5:99 "#FF0000"' },
        message: "existing message",
      };
      await hook["tool.execute.before"](
        { tool: "bash", sessionID: "test-session", callID: "c1" },
        output as any,
      );
      expect(output.message).toContain("existing message");
      expect(output.message).toContain("SCOPE-LOCK");
      expect(output.message?.startsWith("existing message")).toBe(true);
    });
  });
});
