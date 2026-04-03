# Overview

Oh My DesignAgent is a design-first OpenCode plugin fork for resolving Figma comments with structured orchestration.

The old coding-centric execution story is no longer the center of this fork. The runtime now assumes that high-value work looks like:

- loading project design and product guidance
- inspecting real Figma state through `figma-use`
- making targeted canvas changes
- reviewing the result before closing the loop

## Core Idea

The system works because design context is treated as operating instructions, not optional flavor text.

Before an agent decides how to resolve a comment, it should first look for:

1. comment and target-node context
2. relevant files under `docs/`
3. explicit design-memory files configured by the project
4. external references only when local context is insufficient

That memory is injected through the existing context management pipeline so the agent sees the guidance inside the session rather than only inside a static system prompt.

## Design Agents

The runtime uses the existing internal agent keys, but their responsibilities have changed.

| Internal key | Role | What it does |
| --- | --- | --- |
| `sisyphus` | Solacy | Primary design lead and default routing agent |
| `atlas` | Comment Conductor | Runs the end-to-end comment workflow |
| `hephaestus` | Design Worker | Handles deeper design tasks outside the standard comment path |
| `sisyphus-junior` | Canvas Executor | Performs direct Figma mutation through `figma-use` |
| `metis` | Comment Planner | Chooses request type, scope, and memory needs |
| `momus` | Vision Reviewer | Reviews screenshots and exports |
| `oracle` | Design Auditor | Audits system compliance and canvas hygiene |

Supporting agents remain useful:

- `explore` for local search and design-system discovery
- `librarian` for docs and external references
- `multimodal-looker` for image interpretation

## Docs-First Memory

The `design_memory` system now prioritizes the repo `docs/` tree.

At runtime:

1. the docs-memory loader scans the configured docs root
2. files are scored against the current prompt
3. the best candidates are compacted within configured char limits
4. the selected packet is registered into `contextCollector`
5. the existing messages-transform hook injects that packet into the session

This gives the fork a practical memory model without introducing a separate vector store or bypassing the current context pipeline.

## Figma Execution Surface

Figma changes are expected to happen through `figma-use` MCP.

The executor should:

1. check status when configured
2. inspect target node or canvas
3. apply the smallest viable patch
4. inspect or export again for verification

If live Figma access is unavailable, the system can still plan and audit, but it should not pretend that canvas mutation happened.

## What Changed From The Old Runtime

This fork still inherits most of the plugin infrastructure, but several behavioral assumptions changed:

- the main execution backbone is now design-oriented
- docs-first memory is proactive, not reactive
- design review is built into the default flow
- `figma-use` is a first-class builtin skill
- configuration includes `design_memory`, `figma_use`, and `figma.comment_resolution`

For the exact orchestration path, see [Orchestration](./orchestration.md). For the config surface, see [Configuration](../reference/configuration.md).
