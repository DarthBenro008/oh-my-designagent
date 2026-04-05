import { describe, expect, test } from "bun:test";

import {
  CONTEXT_SEPARATOR,
  buildContextGatherCommand,
  buildCreationContextCommand,
  buildPatchContextCommand,
  buildPostRenderCommand,
} from "./figma-context-commands";

describe("figma context command builders", () => {
  test("buildContextGatherCommand includes node inspection commands", () => {
    const result = buildContextGatherCommand("1:23");

    expect(result).toContain("figma-daemon node tree 1:23 --depth 3");
    expect(result).toContain("figma-daemon export jsx 1:23 --pretty");
    expect(result).toContain("figma-daemon node bindings 1:23");
    expect(result).toContain(
      "figma-daemon export node 1:23 --output /tmp/before.png",
    );
  });

  test("buildContextGatherCommand without nodeId stays shallow", () => {
    const result = buildContextGatherCommand(undefined);

    expect(result).not.toContain("node tree");
    expect(result).toContain("figma-daemon status");
    expect(result).toContain("figma-daemon comment list --json");
  });

  test("buildPatchContextCommand stays trimmed", () => {
    const result = buildPatchContextCommand("1:23");

    expect(result).not.toContain("analyze colors");
    expect(result).not.toContain("analyze typography");
    expect(result).toContain("figma-daemon node tree 1:23 --depth 2");
    expect(result).toContain(CONTEXT_SEPARATOR);
  });

  test("buildCreationContextCommand adds analysis commands", () => {
    const result = buildCreationContextCommand("1:23");

    expect(result).toContain("analyze colors");
    expect(result).toContain("analyze typography");
    expect(result).toContain("page bounds");
    expect(result).toContain('figma-daemon variable find ""');
    expect(result).toContain(CONTEXT_SEPARATOR);
  });

  test("all builders use the separator between subcommands", () => {
    const results = [
      buildContextGatherCommand("1:23"),
      buildContextGatherCommand(undefined),
      buildPatchContextCommand("1:23"),
      buildCreationContextCommand("1:23"),
      buildCreationContextCommand(undefined),
      buildPostRenderCommand("1:23"),
    ];

    for (const result of results) {
      expect(result).toContain(CONTEXT_SEPARATOR);
    }
  });

  test("buildPostRenderCommand includes post render verification", () => {
    const result = buildPostRenderCommand("1:23");

    expect(result).toContain("figma-daemon lint --root 1:23 -v");
    expect(result).toContain("/tmp/after.png");
  });
});
