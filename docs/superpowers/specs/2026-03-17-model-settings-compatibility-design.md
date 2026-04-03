# Model Settings Compatibility Resolver Design

Internal technical note retained for the design-agent fork.

## Goal

Introduce a central resolver that takes an already-selected model and desired settings, then returns the best compatible configuration for that exact model.

This is separate from model fallback.

## Why It Still Matters Here

Even though this fork is design-first, it still inherits the same request-time model settings behavior from the base plugin.

That affects:

- orchestration agent stability
- reviewer and auditor reasoning settings
- request behavior on multimodal and `figma-use` related flows

## Problem

When compatibility logic for `variant` and `reasoningEffort` is scattered across multiple runtime paths, request behavior becomes inconsistent.

Typical failure modes:

- some paths clamp unsupported levels
- some paths pass them through unchanged
- some paths silently drop them
- some paths depend on family assumptions that do not generalize

## Phase 1 Scope

Cover only:

- `variant`
- `reasoningEffort`

Out of scope:

- model fallback
- `thinking`
- `maxTokens`
- `temperature`
- `top_p`
- automatic upward remapping

## Desired Behavior

Given a fixed model and desired settings:

1. keep supported values
2. downgrade to the nearest lower compatible value when possible
3. drop the field when no compatible value exists
4. do not switch models
5. do not automatically upscale settings

## Architecture

Add a central shared module for model-settings compatibility.

The resolver should stay pure:

- model selected first
- settings normalized second
- request built third

That separation keeps transport behavior and capability policy from bleeding into each other.

## Compatibility Strategy

### Variant

Prefer provider/runtime metadata where available.

Fallback to family-based ladders only when better metadata is absent.

### Reasoning Effort

Use conservative family and provider heuristics until stronger per-model metadata exists.

## First Integration Point

Integrate into `chat.params` first because it is already the central request-time tuning path.

That keeps Phase 1 small and prevents patching every prompt-construction path at once.

## Recommendation

Proceed as a narrowly scoped compatibility layer:

- one shared resolver
- one central integration point first
- explicit regression tests
- no expansion into fallback or unrelated request policy during Phase 1
