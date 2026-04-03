# Oh My DesignAgent

Oh My DesignAgent is a Figma-comment resolution fork of `oh-my-opencode`.

This fork replaces the old coding-first execution backbone with a design-first agent system that:

- reads project rules from `docs/` before acting
- uses the existing plugin context injection pipeline for memory
- treats `figma-use` MCP as the Figma Plugin API execution surface
- routes comment work through planning, execution, visual review, and design audit

The package and CLI name remain `oh-my-opencode`, but the runtime behavior in this fork is centered on design work rather than general coding automation.

## What This Fork Does

The primary workflow is resolving Figma comments with project context.

1. A design request or Figma comment arrives.
2. Docs-first memory loads from the repo `docs/` folder.
3. The planner classifies the request and selects the right context.
4. The executor uses `figma-use` MCP to inspect and mutate the canvas.
5. Review and audit agents verify the result before completion.

This is not "generic multi-agent coding with some design sprinkled in". The design agents and docs-memory path are now the backbone.

## Design Agent Backbone

The current design roster maps onto the existing internal agent slots so the plugin can evolve without breaking the whole runtime:

| Internal key | Design role | Responsibility |
| --- | --- | --- |
| `sisyphus` | Solacy | Primary design lead and default agent |
| `atlas` | Comment Conductor | Orchestrates one comment-resolution job |
| `hephaestus` | Design Worker | Deep design execution outside the normal comment loop |
| `sisyphus-junior` | Canvas Executor | No-delegation Figma mutation agent |
| `metis` | Comment Planner | Classifies comment type, scope, confidence, and memory needs |
| `momus` | Vision Reviewer | Checks exports and screenshots after changes |
| `oracle` | Design Auditor | Checks tokens, structure, and design-system hygiene |

Supporting agents still exist:

- `explore` for local repo and design-system discovery
- `librarian` for docs and external references
- `multimodal-looker` for image and artifact inspection

## Docs-First Memory

Design memory is now loaded from `docs/` first.

The runtime scans the configured docs root, scores files against the current request, and injects the selected guidance into the existing `contextCollector` pipeline. That means memory is:

- session-scoped
- deduplicated
- injected through the standard `experimental.chat.messages.transform` flow
- truncated with the existing context management system instead of ad hoc prompt stuffing

Explicit `design_memory.files` still work, but they now act as required overrides or fallback sources after docs discovery.

## Figma Execution

Figma work is executed through the builtin `figma-use` skill and MCP integration.

The expected flow is:

1. inspect canvas or node
2. load relevant docs memory
3. apply the smallest viable patch
4. inspect or export again
5. review the result

If memory conflicts with the obvious visual tweak, the system should surface the conflict instead of guessing.

## Quick Config

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
    "max_total_chars": 9600,
    "files": [
      {
        "path": "memory/checkout-behavior.md",
        "type": "user_behavior",
        "priority": 80,
        "tags": ["checkout"],
        "required": true
      }
    ]
  },

  "figma_use": {
    "enabled": true,
    "mcp_server_name": "figma-use",
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

## Relevant Hooks

The key runtime path for this fork is:

- `docs-memory-preloader`
- `experimental.chat.messages.transform` context injection
- existing context collector deduplication and priority ordering

This gives design agents proactive memory loading from `docs/` before they start resolving a comment.

## Documentation

- [Overview](docs/guide/overview.md)
- [Orchestration](docs/guide/orchestration.md)
- [Configuration](docs/reference/configuration.md)
- [Features](docs/reference/features.md)
- [Design Agents and Hooks](docs/reference/design-agents.md)
