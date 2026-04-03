import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import type { PluginInput } from "@opencode-ai/plugin"
import { ContextCollector } from "../../features/context-injector"
import { createDocsMemoryPreloaderHook } from "./hook"

describe("createDocsMemoryPreloaderHook", () => {
  let testDir = ""

  afterEach(() => {
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true })
      testDir = ""
    }
  })

  test("registers docs memory into the context collector for design-agent prompts", async () => {
    testDir = mkdtempSync(join(tmpdir(), "docs-memory-hook-"))
    mkdirSync(join(testDir, "docs"), { recursive: true })
    writeFileSync(
      join(testDir, "docs", "design-rules.md"),
      "Use spacing tokens and preserve typography hierarchy.",
    )

    const collector = new ContextCollector()
    const hook = createDocsMemoryPreloaderHook(
      { directory: testDir } as PluginInput,
      {
        enabled: true,
        docs_first: true,
        docs_root: "docs",
        docs_globs: ["**/*.md"],
        prefer_docs_types: ["design_style"],
        auto_load_for_comment_resolution: true,
        max_docs_files: 2,
        files: [],
        max_chars_per_file: 400,
        max_total_chars: 800,
      },
      collector,
    )

    await hook["chat.message"](
      {
        sessionID: "ses_docs_memory",
        agent: "sisyphus",
      },
      {
        parts: [
          {
            type: "text",
            text: "Resolve this figma comment about spacing.",
          },
        ],
      },
    )

    const pending = collector.getPending("ses_docs_memory")
    expect(pending.hasContent).toBe(true)
    expect(pending.merged).toContain("## Docs Memory")
    expect(pending.merged).toContain("docs/design-rules.md")
  })
})
