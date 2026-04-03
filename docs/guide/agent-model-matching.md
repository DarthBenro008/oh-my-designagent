# Agent Model Matching

This fork still lets you override models per agent, but the important question changed.

It is no longer "which old execution agent should use which model?"

It is now "which model best fits each role in the design-comment workflow?"

## Design Roles

### Solacy

Solacy is the primary design lead.

It benefits from models that are strong at:

- orchestration
- handling long context
- following layered instructions
- balancing product context with execution routing

Good fit:

- Claude-family models
- Kimi / GLM style orchestration models

### Comment Conductor

Comment Conductor manages the end-to-end workflow for one comment.

It needs a model that is reliable at sequencing:

- planning
- execution
- review
- retry or clarification

Good fit:

- strong general orchestration models
- high-compliance models that handle multi-step state well

### Design Worker

Design Worker handles deeper design tasks outside the simplest comment loop.

It benefits from models that are good at:

- independent reasoning
- exploring multiple approaches
- synthesizing product and visual constraints

Good fit:

- GPT-class reasoning models
- other strong autonomous reasoning models if they match your environment

### Canvas Executor

Canvas Executor should prioritize reliability over flourish.

It needs to:

- inspect before changing
- mutate through `figma-use`
- verify after changing

Good fit:

- stable mid-to-high capability models with low temperature

### Comment Planner, Vision Reviewer, Design Auditor

These roles are more specialized:

- Comment Planner needs careful classification and confidence signaling
- Vision Reviewer needs strong visual and artifact interpretation
- Design Auditor needs consistent rule enforcement

Good fit:

- planner: structured reasoning models
- reviewer: models with strong multimodal support
- auditor: high-precision reasoning models with good instruction following

## Practical Guidance

If you only tune a few agents, tune these:

1. `sisyphus` for Solacy
2. `atlas` for Comment Conductor
3. `sisyphus-junior` for Canvas Executor
4. `oracle` for Design Auditor

These roles shape most of the behavior in the default comment workflow.

## Example

```jsonc
{
  "agents": {
    "sisyphus": {
      "model": "anthropic/claude-opus-4-6"
    },
    "atlas": {
      "model": "anthropic/claude-sonnet-4-6"
    },
    "hephaestus": {
      "model": "openai/gpt-5.4"
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

## Important Constraint

Model overrides do not change the runtime role itself.

If you configure `sisyphus`, you are still configuring Solacy.
If you configure `atlas`, you are still configuring Comment Conductor.

The internal keys remain for compatibility, but the behavior they represent is now design-first.
