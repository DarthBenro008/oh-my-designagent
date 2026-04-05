# Manifesto

The principles behind the design-agent fork.

## Design Feedback Should Resolve Cleanly

Figma comments are often not really about a pixel tweak.

They usually encode a mix of:

- product intent
- design-system rules
- user behavior assumptions
- copy guidance
- visual quality expectations

A useful agent should not respond to that with a blind patch.

It should resolve the comment in a way that still fits the product, the system, and the team’s rules.

## Project Guidance Is Not Optional

Most design failures happen because the agent acts without enough context.

That is why this fork treats project guidance as operating instructions:

- read `docs/` first
- load only the most relevant memory
- treat rules and instructions as binding context
- surface conflicts instead of improvising around them

If a comment looks simple but the docs say otherwise, the docs win until clarified.

## Mutation Alone Is Not Success

A change is not done because the canvas changed.

Success means:

- the target comment is actually resolved
- the result still fits the design language
- product behavior and copy remain coherent
- tokens, spacing, variables, and structure still respect the system

That is why this fork uses a planner, executor, reviewer, and auditor instead of a single mutation step.

## The Default Flow Should Feel Predictable

The ideal loop is:

1. understand the comment
2. load the right context
3. inspect the canvas
4. apply the smallest viable change
5. review and audit the result
6. retry or clarify when needed

The system should not require the user to micromanage these steps every time.

## Docs-First Memory Over Prompt Theater

This fork does not rely on giant static prompts pretending to be memory.

Instead it uses:

- docs-first file discovery
- session-scoped context injection
- deduplicated memory packets
- existing context management already present in the plugin

That keeps memory grounded in repo truth instead of hand-written prompt drift.

## Figma Is A Real Runtime Surface

Design work should happen against real Figma state whenever possible.

That is why `figma-daemon` MCP is a first-class part of the fork:

- inspect before mutating
- mutate through the plugin API surface
- inspect or export again after changes

If live state is unavailable, the system can still plan and audit, but it should not pretend it executed.

## What Good Looks Like

The end state is simple:

- the user gives design intent or a Figma comment
- the system loads the right guidance
- the comment is resolved cleanly
- the result still fits the product and the system

If the user has to keep re-explaining the product, the style rules, or the expected behavior, the documentation or memory path is not good enough yet.

## Further Reading

- [Overview](./guide/overview.md)
- [Orchestration](./guide/orchestration.md)
- [Configuration](./reference/configuration.md)
- [Design Agents and Hooks](./reference/design-agents.md)
