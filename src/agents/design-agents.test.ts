import { describe, expect, test } from "bun:test"
import {
  createCommentPlannerAgent,
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
})
