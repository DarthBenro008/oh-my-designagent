# Model Settings Compatibility Resolver Plan

Internal implementation plan retained as technical documentation for the fork.

## Goal

Centralize compatibility handling for `variant` and `reasoningEffort` so an already-selected model receives the best valid settings for that exact model.

This remains relevant to the design-agent fork because the design workflow still depends on stable request-time model settings for:

- Solacy
- Comment Conductor
- reviewer and auditor agents
- multimodal and Figma-adjacent request paths

## Intended Architecture

Introduce a shared pure resolver in `src/shared/` that computes compatible settings and records downgrades or removals.

Integrate it first in `chat.params`, then keep any provider-specific effort logic as a thin supplement rather than the policy owner.

## Planned Work

### 1. Create the shared resolver

- add a pure compatibility module under `src/shared/`
- add focused tests for keep, downgrade, and remove behavior
- export the resolver through the shared module boundary

### 2. Integrate in `chat.params`

- apply resolver output to runtime request settings
- preserve existing merge behavior around stored prompt params
- cover both `variant` and `reasoningEffort`

### 3. Reduce duplicate hook logic

- narrow any provider-specific hook behavior so it supplements the resolver instead of duplicating it
- remove scattered compatibility logic where the shared resolver now owns the policy

### 4. Add regression coverage

- keep supported values unchanged
- downgrade unsupported values to the nearest valid lower setting when possible
- drop unsupported fields when no compatible value exists

### 5. Verify quality

- run focused tests
- run typecheck if the workspace supports it
- review diff for compatibility-only scope

## Non-Goals

- model fallback itself
- automatic model switching
- widening scope into unrelated request-shaping behavior

## Why This Exists In Docs

This page is not a user-facing guide. It is an engineering note kept in the tree because the design-agent fork still inherits and depends on the same low-level model-settings compatibility behavior.
