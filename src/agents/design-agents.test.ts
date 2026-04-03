import { describe, expect, test } from "bun:test"
import {
  createCommentPlannerAgent,
  createDesignAuditorAgent,
} from "./design-agents"

describe("design agent figma-use skill wiring", () => {
  test("attaches figma-use skill to comment planner when figma is enabled", () => {
    const agent = createCommentPlannerAgent({
      model: "openai/gpt-5.4",
      figmaUseEnabled: true,
      figmaUseServerName: "figma-use",
    }) as { skills?: string[] }

    expect(agent.skills).toEqual(["figma-use"])
  })

  test("attaches figma-use skill to design auditor when figma is enabled", () => {
    const agent = createDesignAuditorAgent({
      model: "openai/gpt-5.4",
      figmaUseEnabled: true,
      figmaUseServerName: "figma-use",
    }) as { skills?: string[] }

    expect(agent.skills).toEqual(["figma-use"])
  })

  test("omits figma-use skill when figma is disabled", () => {
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
})
