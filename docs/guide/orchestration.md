# Orchestration

This fork resolves Figma comments through a fixed design workflow instead of the old planning-first coding workflow.

## Comment Resolution Pipeline

The default path is:

1. Solacy receives the request.
2. Docs-memory preloading injects relevant project guidance from `docs/`.
3. Comment Conductor starts the job.
4. Comment Planner classifies the work and selects memory.
5. Canvas Executor performs the Figma operation through `figma-daemon`.
6. Vision Reviewer and Design Auditor verify the result.
7. Comment Conductor accepts, retries once, or asks for clarification.

## Agent Responsibilities

### Solacy

Solacy is the primary agent. It decides whether the request is:

- a direct Figma comment-resolution job
- a broader design task
- a research or clarification task that should not mutate the canvas yet

### Comment Conductor

Comment Conductor owns the lifecycle of a single comment.

It is responsible for:

- enforcing planner before executor on non-trivial work
- ensuring review happens after execution
- stopping mutation when confidence is low
- retrying once when review finds a fixable issue

### Comment Planner

The planner classifies requests into paths such as:

- `copy_change`
- `token_bind`
- `color_update`
- `spacing_fix`
- `typography_update`
- `layout_change`
- `new_component`
- `design_improvement`

It also decides which memory is needed and whether the task should halt for clarification.

### Canvas Executor

Canvas Executor is the only design agent expected to mutate Figma directly.

Rules:

- no delegation
- inspect before patching
- keep mutations minimal
- re-inspect or export after mutation

### Vision Reviewer and Design Auditor

These agents run after execution.

Vision Reviewer checks whether the visible result matches the comment intent.

Design Auditor checks whether the change still respects project rules such as:

- token usage
- spacing conventions
- variable binding
- naming and hierarchy
- component and instance hygiene

## Docs-Memory Flow

The fork uses the existing plugin context-management path instead of introducing a separate memory channel.

Runtime flow:

1. `docs-memory-preloader` runs on `chat.message`
2. it loads a compact memory packet from `docs/` and fallback memory files
3. it registers that packet in `contextCollector`
4. `experimental.chat.messages.transform` injects the merged context into the session

This matters because memory now participates in the same dedupe, ordering, and injection flow as the rest of the system.

## Routing Rules

### Easy

Examples:

- copy tweak
- single color fix
- spacing adjustment on a known node

Path:

1. planner confirms scope
2. executor patches directly
3. reviewer and auditor verify

### Medium

Examples:

- moderate layout cleanup
- typography refinement with tradeoffs
- small structural adjustments

Path:

1. planner loads docs memory
2. executor may create two variants
3. review chooses or rejects

### Hard

Examples:

- new component
- large layout change
- comment that implies product or behavior change

Path:

1. planner loads memory and may ask `explore` or `librarian` for more context
2. executor produces up to three variants
3. review and audit gate completion

### Clarify Instead Of Mutate

The system should stop and ask for clarification when:

- the target node is unclear
- docs memory conflicts with the likely visual fix
- product intent is ambiguous
- confidence is too low for a safe change

## Hooks Involved

The new orchestration path depends on these hooks:

- `docs-memory-preloader`
- `experimental.chat.messages.transform` context injection
- existing context-collector ordering and deduplication

Other hooks from the broader plugin still exist, but these are the key ones for the design-comment workflow.
