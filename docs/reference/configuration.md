# Configuration Reference

This reference focuses on the design-agent and Figma-comment workflow introduced by this fork.

The package and CLI still use the `oh-my-opencode` name. Config continues to load from the same OpenCode plugin locations.

## Config Locations

Project config:

- `.opencode/oh-my-opencode.json`
- `.opencode/oh-my-opencode.jsonc`
- `.opencode/oh-my-openagent.json`
- `.opencode/oh-my-openagent.jsonc`

User config:

- `~/.config/opencode/oh-my-openagent.json`
- `~/.config/opencode/oh-my-openagent.jsonc`
- `~/.config/opencode/oh-my-opencode.json`
- `~/.config/opencode/oh-my-opencode.jsonc`

JSONC is recommended.

Preferred project filename:

- `.opencode/oh-my-opencode.jsonc`

## Minimal Design Setup

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/code-yeongyu/oh-my-openagent/dev/assets/oh-my-opencode.schema.json",

  "design_memory": {
    "enabled": true,
    "docs_first": true,
    "docs_root": "docs",
    "docs_globs": ["**/*.md", "**/*.mdx", "**/*.jsonc"],
    "prefer_docs_types": ["design_style", "product_context"],
    "max_docs_files": 4,
    "max_chars_per_file": 2400,
    "max_total_chars": 9600
  },

  "figma_use": {
    "enabled": true,
    "mcp_server_name": "figma-daemon",
    "require_status_check": true
  },

  "figma": {
    "comment_resolution": {
      "enabled": true,
      "auto_reply": true,
      "max_variants": 3,
      "require_review_above_difficulty": "medium"
    }
  }
}
```

## `design_memory`

This fork uses `design_memory` as the main project-context surface for design work.

### Fields

| Key | Type | Description |
| --- | --- | --- |
| `enabled` | boolean | Enables the design-memory loader |
| `docs_first` | boolean | Searches `docs/` before fallback memory files |
| `docs_root` | string | Root directory to scan for docs memory |
| `docs_globs` | string[] | Allowed file patterns under the docs root |
| `prefer_docs_types` | string[] | Biases selection toward specific memory types |
| `auto_load_for_comment_resolution` | boolean | Allows prompt-based auto-loading for design/comment requests |
| `max_docs_files` | number | Maximum number of docs files selected per packet |
| `files` | object[] | Explicit fallback or required memory files |
| `max_chars_per_file` | number | Per-file memory cap |
| `max_total_chars` | number | Total packet cap |

### Memory File Entry

Each `design_memory.files[]` entry supports:

| Key | Type | Description |
| --- | --- | --- |
| `path` | string | Relative or absolute file path |
| `type` | string | `design_style`, `product_context`, `user_behavior`, `copy_context`, `historical_learnings`, or `custom` |
| `priority` | number | Priority among configured fallback files |
| `tags` | string[] | Optional project tags such as `checkout` or `mobile` |
| `max_chars` | number | Optional per-file override |
| `required` | boolean | Forces inclusion when the file exists |

### Behavior

Selection order is:

1. docs candidates from `docs_root`
2. required configured memory files
3. optional configured memory files

Memory is loaded into `contextCollector` through the docs-memory preloader hook and then injected by the existing messages-transform pipeline.

## `figma_use`

`figma_use` controls the builtin `figma-daemon` MCP skill.

| Key | Type | Description |
| --- | --- | --- |
| `enabled` | boolean | Enables the builtin `figma-daemon` skill |
| `mcp_server_name` | string | MCP server name exposed to the runtime |
| `require_status_check` | boolean | Instructs agents to verify MCP status before mutating |
| `url` | string | Optional HTTP MCP endpoint |
| `command` | string | Optional stdio launcher command |
| `args` | string[] | Optional stdio launcher args |

If `url` is omitted, the builtin skill defaults to a stdio server launched with:

```bash
npx -y figma-daemon mcp serve
```

## `figma.comment_resolution`

This config controls how aggressive the design-comment workflow should be.

| Key | Type | Description |
| --- | --- | --- |
| `enabled` | boolean | Enables the comment-resolution flow |
| `auto_reply` | boolean | Allows automatic reply/status behavior when available |
| `max_variants` | number | Upper bound for generated variants |
| `require_review_above_difficulty` | `easy` \| `medium` \| `hard` | Forces review for tasks above the selected difficulty |
| `memory_required_for` | string[] | Request types that must load memory before execution |

## Agent Overrides

The runtime still uses the existing internal agent keys in config.

| Config key | Runtime role |
| --- | --- |
| `sisyphus` | Solacy |
| `atlas` | Comment Conductor |
| `hephaestus` | Design Worker |
| `sisyphus-junior` | Canvas Executor |
| `metis` | Comment Planner |
| `momus` | Vision Reviewer |
| `oracle` | Design Auditor |

Example:

```jsonc
{
  "agents": {
    "sisyphus": {
      "model": "anthropic/claude-opus-4-6"
    },
    "sisyphus-junior": {
      "model": "anthropic/claude-sonnet-4-6",
      "temperature": 0.1
    },
    "oracle": {
      "model": "openai/gpt-5.4",
      "reasoningEffort": "high"
    }
  }
}
```

The repo includes a fuller example at [.opencode/oh-my-opencode.jsonc](/root/oh-my-designagent/.opencode/oh-my-opencode.jsonc).

Legacy user-facing names such as `solacy`, `comment-conductor`, `design-worker`, and `canvas-executor` are migrated onto those internal keys by the runtime.

## Environment Variables

### `OPENCODE_SESSION_BUDGET_USD`

Optional hard spend cap for the whole root session tree.

- if unset: disabled
- if empty, invalid, zero, or negative: disabled
- if positive: aborts work once cumulative reported cost exceeds the limit

Example:

```bash
export OPENCODE_SESSION_BUDGET_USD=0.50
```

## Relevant Hooks

If you need to disable the docs-first memory path explicitly:

```jsonc
{
  "disabled_hooks": ["docs-memory-preloader"]
}
```

The important hooks for this fork are:

- `docs-memory-preloader`
- context injection via `experimental.chat.messages.transform`

## Practical Example

```jsonc
{
  "design_memory": {
    "enabled": true,
    "docs_first": true,
    "docs_root": "docs",
    "docs_globs": ["**/*.md"],
    "prefer_docs_types": ["design_style", "user_behavior"],
    "max_docs_files": 3,
    "max_chars_per_file": 1800,
    "max_total_chars": 7200,
    "files": [
      {
        "path": "memory/checkout-behavior.md",
        "type": "user_behavior",
        "priority": 90,
        "tags": ["checkout"],
        "required": true
      }
    ]
  },
  "figma_use": {
    "enabled": true
  },
  "figma": {
    "comment_resolution": {
      "enabled": true,
      "max_variants": 2,
      "memory_required_for": ["layout_change", "new_component"]
    }
  }
}
```
