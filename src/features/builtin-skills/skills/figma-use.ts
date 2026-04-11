import type { BuiltinSkill } from "../types";
import type { FigmaUseConfig } from "../../../config";
import type { CommentRequestType } from "../../../shared/comment-classification";

const PATCH_TASK_TYPES = new Set<CommentRequestType>([
  "copy_change",
  "token_bind",
  "color_update",
  "spacing_fix",
  "typography_update",
]);

const CREATION_TASK_TYPES = new Set<CommentRequestType>([
  "new_component",
  "layout_change",
  "design_improvement",
]);

function buildCliSkillTrimmed(): string {
  return `# figma-daemon CLI

CLI for Figma patch work. Run commands via Bash. Keep edits surgical and verify after each mutation.

## Before You Start

\`\`\`bash
figma-daemon status  # Check connection before mutating
\`\`\`

## Common Patch Commands

\`\`\`bash
# Inspect
figma-daemon node tree <id> --depth 3
figma-daemon node get <id>
figma-daemon node bindings <id>

# Mutate
figma-daemon set fill <id> "$Colors/Primary"
figma-daemon set text <id> "New text"
figma-daemon set layout <id> --gap 12 --padding 16
figma-daemon set font <id> --family "Inter" --size 16 --weight 600
figma-daemon set radius <id> 8

# Verify
figma-daemon export node <id> --output /tmp/check.png
figma-daemon export screenshot --output /tmp/viewport.png

# Comments
figma-daemon comment add "Updated the requested patch" --reply <threadId>
# Autonomous design-agent jobs reply only and leave Figma threads open for human review.

# Tokens
figma-daemon variable find "Colors"
\`\`\`

## Best Practices for Patches

- Inspect before mutating with \`figma-daemon node get\` or \`figma-daemon node tree\`.
- Apply the smallest viable patch instead of rebuilding larger structures.
- Use \`$Variable\` token references for colors and other bound values when available.
- Export the changed node or viewport for verification before considering the work done.`;
}

function buildCliSkillFull(): string {
  return `# figma-daemon CLI

CLI for Figma. Run commands via Bash. Two modes: imperative commands and declarative JSX.

## Before You Start

\`\`\`bash
figma-daemon status  # Check connection
\`\`\`

## Two Modes

**Imperative** — single operations:

\`\`\`bash
figma-daemon create frame --width 400 --height 300 --fill "#FFF" --radius 12
figma-daemon set fill <id> "#FF0000"
figma-daemon node move <id> --x 100 --y 200
\`\`\`

**Declarative** — render JSX trees:

\`\`\`bash
echo '<Frame p={24} gap={16} flex="col" bg="#FFF" rounded={12}>
  <Text size={24} weight="bold" color="#000">Title</Text>
  <Text size={14} color="#666">Description</Text>
</Frame>' | figma-daemon render --stdin --x 100 --y 200
\`\`\`

**Elements:** \`Frame\`, \`Rectangle\`, \`Ellipse\`, \`Text\`, \`Line\`, \`Star\`, \`Polygon\`, \`Vector\`, \`Group\`, \`Icon\`, \`Image\`, \`Instance\`

## Icons

150k+ icons from Iconify by name:

\`\`\`bash
figma-daemon create icon mdi:home
figma-daemon create icon lucide:star --size 48 --color "#F59E0B"
\`\`\`

In JSX: \`<Icon name="mdi:home" size={24} color="#3B82F6" />\`

## Variables as Tokens

Reference Figma variables with \`var:Name\` or \`$Name\`:

\`\`\`bash
figma-daemon set fill <id> '$Brand/Accent'
\`\`\`

In JSX: \`<Frame bg="$Colors/Primary" />\`

## Common Commands

\`\`\`bash
# Create
figma-daemon create frame --width 400 --height 300 --fill "#FFF" --layout VERTICAL --gap 16
figma-daemon create text --text "Hello" --font-size 24 --fill "#000"
figma-daemon create rect --width 100 --height 50 --fill "#F00" --radius 8

# Find
figma-daemon query "//FRAME[@name = 'Header']"
figma-daemon find --name "Button"
figma-daemon selection get

# Explore
figma-daemon node ancestors <id>
figma-daemon node bindings <id>
figma-daemon page bounds
figma-daemon variable find "Text/Neutral"

# Modify
figma-daemon set fill <id> "#FF0000"
figma-daemon set radius <id> 12
figma-daemon set text <id> "New text"
figma-daemon set layout <id> --mode VERTICAL --gap 12 --padding 16
figma-daemon node move <id> --x 100 --y 200
figma-daemon node resize <id> --width 300 --height 200
figma-daemon node delete <id> [id2...]
figma-daemon arrange

# Export
figma-daemon export node <id> --output design.png
figma-daemon export screenshot --output viewport.png
figma-daemon export jsx <id> --pretty

# Navigate
figma-daemon page list
figma-daemon page set "Page Name"
figma-daemon viewport zoom-to-fit <id>
\`\`\`

## Export JSX (round-trip)

\`\`\`bash
figma-daemon export jsx <id> --pretty > component.tsx
# ... edit the file ...
figma-daemon render component.tsx --x 500 --y 0
\`\`\`

## Diffs

\`\`\`bash
figma-daemon diff create --from <id1> --to <id2>
figma-daemon diff apply patch.diff
figma-daemon diff apply patch.diff --dry-run
\`\`\`

## Analyze

\`\`\`bash
figma-daemon analyze clusters
figma-daemon analyze colors --show-similar
figma-daemon analyze typography
figma-daemon analyze spacing --grid 8
figma-daemon analyze snapshot <id> -i
\`\`\`

## Lint

\`\`\`bash
figma-daemon lint
figma-daemon lint --preset strict
figma-daemon lint --preset accessibility
\`\`\`

## Style Shorthands (JSX)

| Short | Full | Values |
|-------|------|--------|
| \`w\`, \`h\` | width, height | number or \`"fill"\` |
| \`flex\` | flexDirection | \`"row"\`, \`"col"\` |
| \`gap\` | spacing | number |
| \`p\`, \`px\`, \`py\` | padding | number |
| \`bg\` | fill | hex or \`$Variable\` |
| \`rounded\` | cornerRadius | number |
| \`size\` | fontSize | number |
| \`weight\` | fontWeight | \`"bold"\`, number |
| \`color\` | textColor | hex |

## Best Practices

- Always \`figma-daemon status\` before starting.
- Inspect before mutating: \`figma-daemon node tree\` or \`figma-daemon export jsx <id>\`.
- Position renders with \`--x\` and \`--y\` to avoid stacking at (0,0).
- After batch creation, run \`figma-daemon arrange\` to tidy up.
- Export screenshots for visual verification: \`figma-daemon export node <id> --output /tmp/check.png\`
- After initial render, use diffs or direct commands — don't re-render full JSX trees.
- Human-readable output by default saves tokens. Use \`--json\` only when parsing specific fields.
- Node IDs: format \`session:local\` (e.g., \`1:23\`). Inside instances: \`I<instance-id>;<internal-id>\`.

## Workflow

1. Check connection with \`figma-daemon status\`.
2. Inspect the target node or canvas first.
3. Apply the smallest viable patch for comment-resolution work.
4. Export or inspect again after the change for verification.

Do not guess about Figma structure — inspect it directly with the CLI.

## JSX Rendering Excellence

1. ALWAYS export existing node first: \`figma-daemon export jsx <nodeId> --pretty\`
2. Use \`$Variable\` syntax for ALL colors. Never hardcode hex in production renders.
3. Position with \`--x\` and \`--y\` always. Never stack new work at \`0,0\`.
4. Use \`defineComponent\` for reusable elements and \`defineComponentSet\` for variants.
5. After rendering, check result: \`figma-daemon export node <newId> --output /tmp/check.png\`
6. After initial render, use diffs or direct set commands for tweaks. Don't re-render full JSX trees.
7. Run \`figma-daemon lint --root <newNodeId>\` after rendering to check compliance.`;
}

function buildCliSkill(taskType?: CommentRequestType): string {
  if (taskType && PATCH_TASK_TYPES.has(taskType)) {
    return buildCliSkillTrimmed();
  }

  if (taskType && CREATION_TASK_TYPES.has(taskType)) {
    return buildCliSkillFull();
  }

  return buildCliSkillFull();
}

function buildMcpSkill(
  config: FigmaUseConfig | undefined,
  serverName: string,
): BuiltinSkill {
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
          args: config?.args ?? ["-y", "figma-daemon", "mcp", "serve"],
        },
      };

  return {
    name: "figma-daemon",
    description:
      "Figma Plugin API operations through the figma-daemon MCP server. Use for canvas inspection, node inspection, patching, rendering, export, and other Figma mutations.",
    template: `# figma-daemon MCP

Use the \`${serverName}\` MCP server for Figma Plugin API access.

Workflow:
1. Check MCP/server status before mutating if the task depends on live canvas state.
2. Inspect the target node or canvas first.
3. Apply the smallest viable patch for comment-resolution work.
4. Export or inspect again after the change for verification.

Use figma-daemon for:
- canvas and node inspection
- variable and binding inspection
- patching existing nodes
- rendering new nodes or variants
- exporting screenshots or artifacts for visual review

Do not guess about Figma structure when the MCP can inspect it directly.`,
    mcpConfig,
  };
}

function buildCliSkillDefinition(taskType?: CommentRequestType): BuiltinSkill {
  return {
    name: "figma-daemon",
    description:
      "Control Figma via the figma-daemon CLI. Use Bash to run figma-daemon commands for canvas inspection, node creation, patching, rendering, export, and other Figma mutations.",
    template: buildCliSkill(taskType),
  };
}

export function createFigmaUseSkill(
  config?: FigmaUseConfig,
  taskType?: CommentRequestType,
): BuiltinSkill {
  if (config?.mode === "cli") {
    return buildCliSkillDefinition(taskType);
  }

  const serverName = config?.mcp_server_name ?? "figma-daemon";
  return buildMcpSkill(config, serverName);
}
