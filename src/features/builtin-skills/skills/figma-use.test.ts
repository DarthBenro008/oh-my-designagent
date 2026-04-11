import { describe, expect, test } from "bun:test";
import { createFigmaUseSkill } from "./figma-use";

describe("createFigmaUseSkill", () => {
  test("builds stdio MCP config by default", () => {
    const skill = createFigmaUseSkill({
      enabled: true,
      mcp_server_name: "figma-daemon",
      require_status_check: true,
      mode: "mcp",
    });

    expect(skill.name).toBe("figma-daemon");
    expect(skill.mcpConfig?.["figma-daemon"]?.command).toBe("npx");
    expect(skill.mcpConfig?.["figma-daemon"]?.args).toEqual([
      "-y",
      "figma-daemon",
      "mcp",
      "serve",
    ]);
  });

  test("uses remote MCP config when url is provided", () => {
    const skill = createFigmaUseSkill({
      enabled: true,
      mcp_server_name: "figma-daemon",
      require_status_check: true,
      mode: "mcp",
      url: "http://127.0.0.1:3845/mcp",
    });

    expect(skill.mcpConfig?.["figma-daemon"]?.type).toBe("http");
    expect(skill.mcpConfig?.["figma-daemon"]?.url).toBe(
      "http://127.0.0.1:3845/mcp",
    );
  });

  test("returns CLI skill without mcpConfig when mode is cli", () => {
    const skill = createFigmaUseSkill({
      enabled: true,
      mcp_server_name: "figma-daemon",
      require_status_check: true,
      mode: "cli",
    });

    expect(skill.name).toBe("figma-daemon");
    expect(skill.mcpConfig).toBeUndefined();
    expect(skill.template).toContain("figma-daemon CLI");
    expect(skill.template).toContain("figma-daemon status");
    expect(skill.template).toContain("figma-daemon create frame");
  });

  test("returns the full CLI template when task type is omitted", () => {
    const skill = createFigmaUseSkill(
      {
        enabled: true,
        mcp_server_name: "figma-daemon",
        mode: "cli",
        require_status_check: true,
      },
      undefined,
    );

    expect(skill.template).toContain("render --stdin");
    expect(skill.template).toContain("analyze colors");
  });

  test("returns the trimmed CLI template for patch tasks", () => {
    const skill = createFigmaUseSkill(
      {
        enabled: true,
        mcp_server_name: "figma-daemon",
        mode: "cli",
        require_status_check: true,
      },
      "copy_change",
    );

    expect(skill.template).not.toContain("render --stdin");
    expect(skill.template).not.toContain("analyze colors");
    expect(skill.template).not.toContain("analyze typography");
    expect(skill.template).toContain("set fill");
    expect(skill.template).toContain("set text");
    expect(skill.template).toContain("comment add");
    expect(skill.template).not.toContain("comment resolve");
    expect(skill.template).toContain("leave Figma threads open");
  });

  test("returns the full CLI template for creation tasks", () => {
    const skill = createFigmaUseSkill(
      {
        enabled: true,
        mcp_server_name: "figma-daemon",
        mode: "cli",
        require_status_check: true,
      },
      "new_component",
    );

    expect(skill.template).toContain("render --stdin");
    expect(skill.template).toContain("defineComponent");
    expect(skill.template).toContain("JSX Rendering Excellence");
    expect(skill.template).toContain("analyze colors");
  });

  test("keeps MCP mode behavior unchanged", () => {
    const skill = createFigmaUseSkill({
      enabled: true,
      mcp_server_name: "figma-daemon",
      require_status_check: true,
      mode: "mcp",
    });

    expect(skill.template).toContain("figma-daemon MCP");
    expect(skill.template).not.toContain("JSX Rendering Excellence");
    expect(skill.mcpConfig?.["figma-daemon"]?.command).toBe("npx");
  });
});
