import type { BuiltinSkill } from "../types"
import type { FigmaUseConfig } from "../../../config"

export function createFigmaUseSkill(config?: FigmaUseConfig): BuiltinSkill {
  const serverName = config?.mcp_server_name ?? "figma-use"
  const mcpConfig = config?.url
    ? {
        [serverName]: {
          type: "http" as const,
          url: config.url,
        },
      }
    : {
        [serverName]: {
          type: "stdio" as const,
          command: config?.command ?? "npx",
          args: config?.args ?? ["-y", "figma-use", "mcp", "serve"],
        },
      }

  return {
    name: "figma-use",
    description: "Figma Plugin API operations through the figma-use MCP server. Use for canvas inspection, node inspection, patching, rendering, export, and other Figma mutations.",
    template: `# figma-use MCP

Use the \`${serverName}\` MCP server for Figma Plugin API access.

Workflow:
1. Check MCP/server status before mutating if the task depends on live canvas state.
2. Inspect the target node or canvas first.
3. Apply the smallest viable patch for comment-resolution work.
4. Export or inspect again after the change for verification.

Use figma-use for:
- canvas and node inspection
- variable and binding inspection
- patching existing nodes
- rendering new nodes or variants
- exporting screenshots or artifacts for visual review

Do not guess about Figma structure when the MCP can inspect it directly.`,
    mcpConfig,
  }
}
