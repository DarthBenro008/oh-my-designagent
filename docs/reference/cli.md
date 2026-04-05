# CLI Reference

Reference for the published `oh-my-opencode` CLI used by this design-agent fork.

The binary and package name remain `oh-my-opencode` even though the runtime behavior described by this fork is design-first.

## Basic Usage

```bash
bunx oh-my-opencode
```

## Commands

| Command | Description |
| --- | --- |
| `install` | Interactive setup wizard |
| `doctor` | Environment diagnostics and health checks |
| `run` | Run an OpenCode session and wait for completion |
| `get-local-version` | Show local version and update status |
| `refresh-model-capabilities` | Refresh model capability snapshot data |
| `version` | Show version information |
| `mcp oauth` | Manage MCP OAuth authentication |

## `install`

```bash
bunx oh-my-opencode install
```

What it does:

1. configures provider/subscription choices
2. registers the plugin in OpenCode
3. writes baseline config
4. shows authentication guidance

For this fork, the installer should be followed by adding design-specific config such as:

- `design_memory`
- `figma_use`
- `figma.comment_resolution`

## `doctor`

```bash
bunx oh-my-opencode doctor
```

Useful for this fork because it verifies:

- OpenCode availability
- plugin registration
- config validity
- model resolution
- tool and MCP availability

When the design-agent workflow is not behaving correctly, `doctor` is the first command to run.

Helpful options:

| Option | Description |
| --- | --- |
| `--status` | Compact dashboard |
| `--verbose` | Detailed diagnostics |
| `--json` | Structured machine-readable output |

## `run`

```bash
bunx oh-my-opencode run "Resolve the open Figma comment on the checkout footer"
```

This command runs a session and waits for completion rather than returning immediately.

Relevant options:

| Option | Description |
| --- | --- |
| `-a, --agent <name>` | Agent to use; default resolves through config and runtime defaults |
| `-m, --model <provider/model>` | Model override |
| `-d, --directory <path>` | Working directory |
| `-p, --port <port>` | OpenCode server port |
| `--attach <url>` | Attach to an existing OpenCode server |
| `--on-complete <command>` | Shell command to run after completion |
| `--json` | Structured JSON output |
| `--no-timestamp` | Disable timestamp prefix |
| `--verbose` | Full event stream |
| `--session-id <id>` | Resume an existing session |

For this fork, the effective default agent role is Solacy, even though compatibility paths still use the internal key `sisyphus`.

## `get-local-version`

```bash
bunx oh-my-opencode get-local-version
```

Shows:

- installed version
- latest available version
- whether the install is up to date

## `version`

```bash
bunx oh-my-opencode version
```

## `mcp oauth`

Use this when a remote MCP server requires OAuth.

Examples:

```bash
bunx oh-my-opencode mcp oauth login <server-name> --server-url https://api.example.com
bunx oh-my-opencode mcp oauth logout <server-name> --server-url https://api.example.com
bunx oh-my-opencode mcp oauth status [server-name]
```

## Configuration Files

The runtime loads user config as base config, then project config on top.

Project config:

1. `.opencode/oh-my-openagent.jsonc`
2. `.opencode/oh-my-openagent.json`
3. `.opencode/oh-my-opencode.jsonc`
4. `.opencode/oh-my-opencode.json`

User config:

1. `~/.config/opencode/oh-my-openagent.jsonc`
2. `~/.config/opencode/oh-my-openagent.json`
3. `~/.config/opencode/oh-my-opencode.jsonc`
4. `~/.config/opencode/oh-my-opencode.json`

JSONC is preferred.

## Design-Agent Notes

The CLI itself is generic, but the current fork expects these runtime features to be configured:

- docs-first memory from `docs/`
- `figma-daemon` MCP
- Figma comment-resolution settings

See:

- [Installation](../guide/installation.md)
- [Configuration](./configuration.md)
- [Design Agents and Hooks](./design-agents.md)
