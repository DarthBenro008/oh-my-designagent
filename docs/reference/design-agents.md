# Design Agents And Hooks

This page documents the design-agent cutover in this fork.

## Agent Mapping

The runtime still stores configuration under the existing internal agent keys, but those keys now represent different roles.

| Internal key | Display name | Responsibility |
| --- | --- | --- |
| `sisyphus` | Solacy (Design Lead) | Main entrypoint and design lead |
| `atlas` | Comment Conductor | Orchestrates the comment-resolution lifecycle |
| `hephaestus` | Design Worker | Deep design execution agent |
| `sisyphus-junior` | Canvas Executor | Mutates Figma through `figma-use` only |
| `metis` | Comment Planner | Reads context, classifies the request, chooses the path |
| `momus` | Vision Reviewer | Reviews screenshots, exports, and visual deltas |
| `oracle` | Design Auditor | Audits rule compliance and design-system hygiene |

## Role Details

### Solacy

- primary user-facing agent
- routes work into the design-comment pipeline
- should prefer docs memory and local guidance before external research

### Comment Conductor

- owns one comment job end to end
- coordinates planning, execution, review, retry, or clarification
- should not treat a raw patch as success without review

### Design Worker

- handles broader design tasks outside the strict comment loop
- still uses docs memory and `figma-use` when the task depends on live canvas state

### Canvas Executor

- no delegation
- expected to inspect before patching
- expected to verify after patching
- should only mutate through `figma-use`

### Comment Planner

- classifies the request into a normalized request type
- selects the memory that should shape the decision
- decides whether the system should patch directly, branch into variants, or ask for clarification

### Vision Reviewer

- judges whether the visible result resolves the request
- should prefer concrete visual mismatches over vague praise

### Design Auditor

- checks token usage, spacing, naming, structure, and other hygiene signals
- should flag rule violations even if the visual result appears acceptable

## Hook Path

The main hook path introduced by this cutover is:

1. `docs-memory-preloader`
2. `contextCollector`
3. `experimental.chat.messages.transform`

### `docs-memory-preloader`

Runs on `chat.message` and:

- checks whether the current prompt or agent implies design-comment work
- loads a compact packet from `docs/` first
- falls back to required and optional configured memory files
- registers the result into `contextCollector`

### Context Injection

The existing context injector then prepends that memory packet to the session once, using the same merge and dedupe behavior as the rest of the runtime.

## Memory Precedence

The practical precedence in this fork is:

1. prompt and comment context
2. docs-first project memory
3. required configured memory files
4. optional configured memory files
5. external research when still necessary

## Request Types

The planner is expected to normalize comment work into request types such as:

- `copy_change`
- `token_bind`
- `color_update`
- `spacing_fix`
- `typography_update`
- `layout_change`
- `new_component`
- `design_improvement`

These types are used to decide whether memory is mandatory, how many variants are allowed, and whether review is required.
