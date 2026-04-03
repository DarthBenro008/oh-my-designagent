# Installation

This fork keeps the published package and CLI name `oh-my-opencode`, but the runtime behavior is now design-first.

## Quick Install

```bash
bunx oh-my-opencode install
```

The installer still sets up the OpenCode plugin registration and baseline config. After that, add the design-specific config needed for docs-first memory and `figma-use`.

## What To Verify

After installation:

```bash
opencode --version
bunx oh-my-opencode doctor
```

You should also verify that your OpenCode plugin config contains either the canonical plugin entry or the compatibility entry accepted by this runtime.

## Minimum Design Config

Add a project config file if you do not already have one:

- `.opencode/oh-my-opencode.jsonc`
- `.opencode/oh-my-openagent.jsonc`

Use `.opencode/oh-my-opencode.jsonc` as the preferred filename. The `oh-my-openagent` name is compatibility-only.

Recommended minimum:

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
    "max_total_chars": 9600
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

This repo now includes a fuller design-agent example at [.opencode/oh-my-opencode.jsonc](/root/oh-my-designagent/.opencode/oh-my-opencode.jsonc).

## Recommended Agent Mapping

Use the internal config keys, but think of them as the design roles:

| Config key | Public role | Recommended model |
| --- | --- | --- |
| `sisyphus` | Solacy | `anthropic/claude-opus-4-6` |
| `atlas` | Comment Conductor | `anthropic/claude-sonnet-4-6` |
| `hephaestus` | Design Worker | `openai/gpt-5.4` |
| `sisyphus-junior` | Canvas Executor | `anthropic/claude-sonnet-4-6` |
| `metis` | Comment Planner | `openai/gpt-5.4-mini` |
| `momus` | Vision Reviewer | `google/gemini-3.1-pro` |
| `oracle` | Design Auditor | `openai/gpt-5.4` |

## Docs Folder Expectations

This fork expects the repo `docs/` tree to contain the rules the design agents should follow.

Good candidates include:

- design-system rules
- product context
- user behavior notes
- copy guidance
- historical decisions

The runtime will load the most relevant docs first and inject them into the session through the existing context pipeline.

## `figma-use` MCP

When `figma_use.enabled` is on, the builtin skill exposes `figma-use` as the Figma Plugin API execution surface.

By default it launches a stdio MCP server with:

```bash
npx -y figma-use mcp serve
```

If you run your own server, set `figma_use.url` or provide a custom `command` and `args`.

## Provider Authentication

Use normal OpenCode provider auth flows for the models you want to run:

```bash
opencode auth login
```

Pick the providers that fit your preferred design-agent setup. In practice:

- orchestration agents benefit from strong instruction-following models
- review and audit agents benefit from strong reasoning models
- multimodal work benefits from strong vision-capable models

See [Agent Model Matching](./agent-model-matching.md) for concrete guidance.

## How To Use It

The usual setup is:

1. Put product, design-system, copy, and user-behavior rules in `docs/`.
2. Configure `.opencode/oh-my-opencode.jsonc`.
3. Make sure `figma-use` MCP is reachable.
4. Open OpenCode and ask the default agent to resolve a Figma comment, or trigger that flow through your own comment transport.

Typical prompts:

- `Resolve the latest comment on the checkout CTA in Figma.`
- `Review this Figma comment, load docs context first, and only patch the target node if confidence is high.`
- `Use the design-agent flow to fix the spacing and copy issues called out in the selected frame.`

The expected execution path is:

1. Solacy receives the task.
2. Docs memory loads from `docs/`.
3. Comment Planner classifies the request.
4. Canvas Executor performs the Figma mutation through `figma-use`.
5. Vision Reviewer and Design Auditor verify the result.

## Optional Spend Limit

If you want all work to stop once a USD budget is exceeded, set:

```bash
export OPENCODE_SESSION_BUDGET_USD=0.50
```

If the variable is not set, no spend limit is enforced.

## After Install

Once installed:

1. make sure your repo has a meaningful `docs/` folder
2. enable `design_memory`
3. enable `figma_use`
4. enable `figma.comment_resolution`
5. verify the config with `bunx oh-my-opencode doctor`

Then the default design flow becomes:

1. load docs memory
2. classify the Figma comment
3. inspect the canvas
4. mutate through `figma-use`
5. review and audit the result

## Compatibility Notes

- Package and CLI name remain `oh-my-opencode`
- Runtime compatibility still recognizes legacy naming in config and plugin registration
- Internal agent keys such as `sisyphus` and `atlas` remain in config even though their public roles are now Solacy and Comment Conductor
- `.opencode/oh-my-opencode.jsonc` is the preferred project config filename

For the current runtime behavior, read:

- [Overview](./overview.md)
- [Orchestration](./orchestration.md)
- [Configuration](../reference/configuration.md)
