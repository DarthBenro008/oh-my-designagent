import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { loadDesignMemoryPacket } from "./design-memory"

describe("loadDesignMemoryPacket", () => {
  let testDir = ""

  afterEach(() => {
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true })
      testDir = ""
    }
  })

  test("loads docs-first memory before configured files and truncates to limits", () => {
    testDir = mkdtempSync(join(tmpdir(), "design-memory-"))
    mkdirSync(join(testDir, "docs", "guide"), { recursive: true })
    mkdirSync(join(testDir, "memory"), { recursive: true })
    writeFileSync(
      join(testDir, "docs", "guide", "design-rules.md"),
      "spacing rules typography hierarchy figma comment ".repeat(30),
    )
    writeFileSync(
      join(testDir, "docs", "overview.md"),
      "product overview workflows ".repeat(30),
    )
    writeFileSync(join(testDir, "memory", "design.md"), "design-guidance ".repeat(40))
    writeFileSync(join(testDir, "memory", "product.md"), "product-context ".repeat(40))

    const packet = loadDesignMemoryPacket({
      directory: testDir,
      prompt: "Resolve a figma comment about spacing and typography",
      config: {
        enabled: true,
        docs_first: true,
        docs_root: "docs",
        docs_globs: ["**/*.md"],
        prefer_docs_types: ["design_style"],
        auto_load_for_comment_resolution: true,
        max_docs_files: 2,
        max_chars_per_file: 60,
        max_total_chars: 180,
        files: [
          { path: "memory/product.md", type: "product_context", priority: 10, tags: [], required: false },
          { path: "memory/design.md", type: "design_style", priority: 90, tags: ["visual"], required: false },
        ],
      },
    })

    expect(packet.files.length).toBeGreaterThanOrEqual(2)
    expect(packet.files[0]?.source).toBe("docs")
    expect(packet.files[0]?.relativePath).toBe("docs/guide/design-rules.md")
    expect(packet.summary).toContain("design_style")
    expect(packet.summary).toContain("product_context")
    expect(packet.summary).toContain("source: docs")
    expect(packet.summary.length).toBeLessThanOrEqual(700)
  })

  test("includes required configured files alongside docs memory", () => {
    testDir = mkdtempSync(join(tmpdir(), "design-memory-required-"))
    mkdirSync(join(testDir, "docs"), { recursive: true })
    mkdirSync(join(testDir, "memory"), { recursive: true })
    writeFileSync(join(testDir, "docs", "manifesto.md"), "design manifesto ".repeat(20))
    writeFileSync(join(testDir, "memory", "behavior.md"), "checkout friction user behavior ".repeat(20))

    const packet = loadDesignMemoryPacket({
      directory: testDir,
      prompt: "Fix a figma comment in checkout",
      config: {
        enabled: true,
        docs_first: true,
        docs_root: "docs",
        docs_globs: ["**/*.md"],
        prefer_docs_types: [],
        auto_load_for_comment_resolution: true,
        max_docs_files: 1,
        max_chars_per_file: 120,
        max_total_chars: 260,
        files: [
          {
            path: "memory/behavior.md",
            type: "user_behavior",
            priority: 20,
            tags: ["checkout"],
            required: true,
          },
        ],
      },
    })

    expect(packet.files.map((file) => file.relativePath)).toEqual([
      "docs/manifesto.md",
      "memory/behavior.md",
    ])
  })

  test("returns empty packet when disabled", () => {
    const packet = loadDesignMemoryPacket({
      directory: process.cwd(),
      config: {
        enabled: false,
        docs_first: true,
        docs_root: "docs",
        docs_globs: ["**/*.md"],
        prefer_docs_types: [],
        auto_load_for_comment_resolution: true,
        max_docs_files: 4,
        files: [],
        max_chars_per_file: 100,
        max_total_chars: 100,
      },
    })

    expect(packet.files).toHaveLength(0)
    expect(packet.summary).toBe("")
  })
})
