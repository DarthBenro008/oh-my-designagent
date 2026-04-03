# Features Reference

This fork keeps the inherited plugin infrastructure, but the main runtime story is now design-comment resolution.

## Core Features

### Design Agent Backbone

The default execution backbone is now design-first.

| Internal key | Role | Summary |
| --- | --- | --- |
| `sisyphus` | Solacy | Default design lead |
| `atlas` | Comment Conductor | End-to-end orchestration for a comment |
| `hephaestus` | Design Worker | Deep design execution |
| `sisyphus-junior` | Canvas Executor | Direct Figma executor with no delegation |
| `metis` | Comment Planner | Request classification and memory selection |
| `momus` | Vision Reviewer | Visual result review |
| `oracle` | Design Auditor | Design-system and hygiene audit |

### Docs-First Memory

The docs-memory system is now proactive.

It:

- scans `docs/` before fallback memory files
- scores docs against the current request
- builds a compact memory packet
- injects that packet into the existing context pipeline

This is the main behavioral shift from the older code-first runtime.

### `figma-use` MCP Skill

The builtin `figma-use` skill provides Figma Plugin API access through MCP.

Expected operations include:

- canvas inspection
- node inspection
- patching existing nodes
- rendering new nodes or variants
- exporting images for review

### Integrated Review

Execution is not considered complete after a patch alone.

The runtime expects:

1. mutation by Canvas Executor
2. visual review by Vision Reviewer
3. rule and hygiene audit by Design Auditor

## Hooks That Matter For This Fork

### `docs-memory-preloader`

Runs on `chat.message`.

Responsibilities:

- detect relevant design or comment-resolution prompts
- preload guidance from `docs/`
- register docs memory into `contextCollector`

### Context Injection

The existing `experimental.chat.messages.transform` hook consumes pending context from `contextCollector` and injects it into the session.

That means docs memory benefits from:

- priority ordering
- deduplication
- one-shot session injection

### Existing Support Hooks

This fork still uses the broader runtime features where they help:

- skill loading
- MCP registration
- agent config migration
- fallback and tool-guard infrastructure

## Utility Agents

The supporting agents still matter even though the backbone changed.

| Agent | Use |
| --- | --- |
| `explore` | Search the repo for design-system patterns, product semantics, and local conventions |
| `librarian` | Gather docs, API references, and external pattern research |
| `multimodal-looker` | Inspect screenshots and visual artifacts |

## Compatibility Notes

The config surface still uses the old internal keys. The runtime maps newer user-facing names onto those keys so existing infrastructure can keep working while the design-agent naming remains readable in the UI and docs.
