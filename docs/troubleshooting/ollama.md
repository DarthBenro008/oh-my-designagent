# Ollama Troubleshooting

## Streaming Issue: JSON Parse Error

### Problem

When using Ollama as a provider with this fork, tool-using sessions may fail with:

```text
JSON Parse error: Unexpected EOF
```

This usually appears when an agent performs tool calls and the underlying provider response is streamed as NDJSON.

### Root Cause

Ollama returns newline-delimited JSON when `stream: true` is enabled.

The surrounding SDK path expects a single JSON object, not a stream of JSON lines, so tool-call parsing can fail before the agent receives a valid structured response.

This is not specific to one design agent. Any tool-using path can hit it.

### Recommended Fix

Disable streaming for the Ollama provider:

```json
{
  "provider": "ollama",
  "model": "qwen3-coder",
  "stream": false
}
```

### Why This Works

With `stream: false`, Ollama returns a single JSON response instead of NDJSON. That avoids the parse mismatch in the upstream request path.

### Tradeoff

- more reliable tool behavior
- slightly less interactive response streaming

### What Is Safe

Safer:

- simple non-tool prompts
- sessions that do not depend on structured tool calls

Riskier:

- tool-heavy exploration
- `figma-use` driven execution
- any flow that depends on structured tool-call parsing

### Validation

After disabling streaming, retry the same request and confirm that the session can complete tool calls without the parse error.

### Related Notes

This is a transport/runtime compatibility issue, not a design-agent planning issue. If the provider response cannot be parsed correctly, the higher-level design workflow cannot recover from that alone.
