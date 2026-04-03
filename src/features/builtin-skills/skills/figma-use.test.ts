import { describe, expect, test } from "bun:test"
import { createFigmaUseSkill } from "./figma-use"

describe("createFigmaUseSkill", () => {
  test("builds stdio MCP config by default", () => {
    const skill = createFigmaUseSkill({ enabled: true, mcp_server_name: "figma-use", require_status_check: true })

    expect(skill.name).toBe("figma-use")
    expect(skill.mcpConfig?.["figma-use"]?.command).toBe("npx")
    expect(skill.mcpConfig?.["figma-use"]?.args).toEqual(["-y", "figma-use", "mcp", "serve"])
  })

  test("uses remote MCP config when url is provided", () => {
    const skill = createFigmaUseSkill({
      enabled: true,
      mcp_server_name: "figma-use",
      require_status_check: true,
      url: "http://127.0.0.1:3845/mcp",
    })

    expect(skill.mcpConfig?.["figma-use"]?.type).toBe("http")
    expect(skill.mcpConfig?.["figma-use"]?.url).toBe("http://127.0.0.1:3845/mcp")
  })
})
