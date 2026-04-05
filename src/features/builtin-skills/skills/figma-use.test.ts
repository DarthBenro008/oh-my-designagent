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
});
