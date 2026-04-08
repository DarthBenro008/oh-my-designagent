import { describe, expect, test } from "bun:test"
import {
  createCanvasExecutorAgent,
  createCommentPlannerAgent,
  createSolacyAgent,
  createDesignAuditorAgent,
} from "./design-agents"

describe("design agent figma-daemon skill wiring", () => {
  test("attaches figma-daemon skill to comment planner when figma is enabled", () => {
    const agent = createCommentPlannerAgent({
      model: "openai/gpt-5.4",
      figmaUseEnabled: true,
      figmaUseServerName: "figma-daemon",
    }) as { skills?: string[] }

    expect(agent.skills).toEqual(["figma-daemon"])
  })

  test("attaches figma-daemon skill to design auditor when figma is enabled", () => {
    const agent = createDesignAuditorAgent({
      model: "openai/gpt-5.4",
      figmaUseEnabled: true,
      figmaUseServerName: "figma-daemon",
    }) as { skills?: string[] }

    expect(agent.skills).toEqual(["figma-daemon"])
  })

  test("omits figma-daemon skill when figma is disabled", () => {
    const planner = createCommentPlannerAgent({
      model: "openai/gpt-5.4",
      figmaUseEnabled: false,
    }) as { skills?: string[] }
    const auditor = createDesignAuditorAgent({
      model: "openai/gpt-5.4",
      figmaUseEnabled: false,
    }) as { skills?: string[] }

    expect(planner.skills).toBeUndefined()
    expect(auditor.skills).toBeUndefined()
  })

  test("planner prompt requires edit intent classification", () => {
    const agent = createCommentPlannerAgent({
      model: "openai/gpt-5.4",
      figmaUseEnabled: true,
      figmaUseServerName: "figma-daemon",
    }) as { prompt?: string }

    expect(agent.prompt).toContain("Edit Intent")
    expect(agent.prompt).toContain("text_only")
    expect(agent.prompt).toContain("frame_props_only")
    expect(agent.prompt).toContain("create_variants")
  })

  test("solacy prompt requires thread-root replies and full-thread reading", () => {
    const agent = createSolacyAgent({
      model: "openai/gpt-5.4",
      figmaUseEnabled: true,
      figmaUseServerName: "figma-daemon",
      figmaUseMode: "cli",
    }) as { prompt?: string }

    expect(agent.prompt).toContain("Read the full comment thread")
    expect(agent.prompt).toContain("--reply <threadRootId>")
    expect(agent.prompt).toContain("reply with 1-3 precise questions")
  })

  test("canvas executor prompt blocks comment finalization and includes intent gate", () => {
    const agent = createCanvasExecutorAgent({
      model: "openai/gpt-5.4",
      figmaUseEnabled: true,
      figmaUseServerName: "figma-daemon",
      figmaUseMode: "cli",
    }) as { prompt?: string }

    expect(agent.prompt).toContain("Do not reply to or resolve Figma comments yourself.")
    expect(agent.prompt).toContain("If Routing = \"clarify\", perform no mutation.")
    expect(agent.prompt).toContain("create_variants: clone the target into sibling frames/components first")
  })
})
