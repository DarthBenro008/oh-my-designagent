# Model Capabilities Maintenance

This fork still relies on the shared model-capability maintenance path from the base plugin.

That capability data matters here because the design-agent runtime still depends on correct model normalization and compatibility decisions for:

- Solacy and Comment Conductor model resolution
- reviewer and auditor reasoning settings
- `figma-use` and multimodal workflows that depend on stable model capabilities

## Capability Resolution Layers

The project treats capability resolution as a layered system:

1. runtime metadata from connected providers
2. bundled or refreshed `models.dev` snapshot data
3. explicit compatibility aliases
4. heuristic fallback when stronger metadata is absent

## Internal Policy

- Built-in agent and category requirement models should use canonical model IDs.
- Aliases exist only for compatibility with historical names or provider-specific decorated variants.
- New decorated names should not become the canonical built-in requirement form when structured settings already express the same thing.
- Normalize aliases at the edge and continue internally with canonical IDs.

## When Adding An Alias

- add the alias to the shared alias map
- record why the alias is needed
- add or update tests for the alias explicitly
- ensure the canonical target exists in the bundled capability snapshot

## Guardrails

The model-capability guardrails should continue to enforce:

- alias targets must exist in the bundled snapshot
- alias keys must not silently become canonical IDs
- pattern aliases must not rewrite already-canonical IDs
- built-in requirement models should stay canonical and snapshot-backed

## Why This Matters For The Fork

This is low-level infrastructure, but it still affects the design-agent fork directly.

If capability metadata drifts, the visible failures show up as:

- unstable model settings for planner, reviewer, or auditor roles
- inconsistent request-time settings on real design workflows
- hard-to-debug differences between configured and actual runtime behavior
