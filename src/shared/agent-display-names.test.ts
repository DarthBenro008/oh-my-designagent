import { describe, it, expect } from "bun:test"
import { AGENT_DISPLAY_NAMES, getAgentConfigKey, getAgentDisplayName, getAgentListDisplayName, normalizeAgentForPrompt } from "./agent-display-names"

describe("getAgentDisplayName", () => {
  it("returns display name for lowercase config key (new format)", () => {
    // given config key "sisyphus"
    const configKey = "sisyphus"

    // when getAgentDisplayName called
    const result = getAgentDisplayName(configKey)

    // then returns the new design-facing display name
    expect(result).toBe("Solacy (Design Lead)")
  })

  it("returns display name for uppercase config key (old format - case-insensitive)", () => {
    // given config key "Sisyphus" (old format)
    const configKey = "Sisyphus"

    // when getAgentDisplayName called
    const result = getAgentDisplayName(configKey)

    // then returns the new design-facing display name (case-insensitive lookup)
    expect(result).toBe("Solacy (Design Lead)")
  })

  it("returns original key for unknown agents (fallback)", () => {
    // given config key "custom-agent"
    const configKey = "custom-agent"

    // when getAgentDisplayName called
    const result = getAgentDisplayName(configKey)

    // then returns "custom-agent" (original key unchanged)
    expect(result).toBe("custom-agent")
  })

  it("returns display name for atlas", () => {
    // given config key "atlas"
    const configKey = "atlas"

    // when getAgentDisplayName called
    const result = getAgentDisplayName(configKey)

     // then returns "Comment Conductor"
    expect(result).toBe("Comment Conductor")
  })

  it("returns display name for prometheus", () => {
    // given config key "prometheus"
    const configKey = "prometheus"

    // when getAgentDisplayName called
    const result = getAgentDisplayName(configKey)

    // then returns "Prometheus (Plan Builder)"
    expect(result).toBe("Prometheus (Plan Builder)")
  })

  it("returns display name for sisyphus-junior", () => {
    // given config key "sisyphus-junior"
    const configKey = "sisyphus-junior"

    // when getAgentDisplayName called
    const result = getAgentDisplayName(configKey)

    // then returns "Canvas Executor"
    expect(result).toBe("Canvas Executor")
  })

  it("returns display name for metis", () => {
    // given config key "metis"
    const configKey = "metis"

    // when getAgentDisplayName called
    const result = getAgentDisplayName(configKey)

    // then returns "Comment Planner"
    expect(result).toBe("Comment Planner")
  })

  it("returns display name for momus", () => {
    // given config key "momus"
    const configKey = "momus"

    // when getAgentDisplayName called
    const result = getAgentDisplayName(configKey)

     // then returns "Vision Reviewer"
    expect(result).toBe("Vision Reviewer")
  })

  it("returns display name for oracle", () => {
    // given config key "oracle"
    const configKey = "oracle"

    // when getAgentDisplayName called
    const result = getAgentDisplayName(configKey)

    // then returns "Design Auditor"
    expect(result).toBe("Design Auditor")
  })

  it("returns display name for librarian", () => {
    // given config key "librarian"
    const configKey = "librarian"

    // when getAgentDisplayName called
    const result = getAgentDisplayName(configKey)

    // then returns "Librarian"
    expect(result).toBe("Librarian")
  })

  it("returns display name for explore", () => {
    // given config key "explore"
    const configKey = "explore"

    // when getAgentDisplayName called
    const result = getAgentDisplayName(configKey)

    // then returns "Explore"
    expect(result).toBe("Explore")
  })

  it("returns display name for multimodal-looker", () => {
    // given config key "multimodal-looker"
    const configKey = "multimodal-looker"

    // when getAgentDisplayName called
    const result = getAgentDisplayName(configKey)

    // then returns "Multimodal Looker"
    expect(result).toBe("Multimodal Looker")
  })
})

describe("getAgentConfigKey", () => {
  it("resolves display name to config key", () => {
    // given legacy display name "Sisyphus (Ultraworker)"
    // when getAgentConfigKey called
    // then returns "sisyphus"
    expect(getAgentConfigKey("Sisyphus (Ultraworker)")).toBe("sisyphus")
  })

  it("resolves display name case-insensitively", () => {
    // given legacy display name in different case
    // when getAgentConfigKey called
    // then returns "atlas"
    expect(getAgentConfigKey("atlas (plan executor)")).toBe("atlas")
  })

  it("passes through lowercase config keys unchanged", () => {
    // given lowercase config key "prometheus"
    // when getAgentConfigKey called
    // then returns "prometheus"
    expect(getAgentConfigKey("prometheus")).toBe("prometheus")
  })

  it("returns lowercased unknown agents", () => {
    // given unknown agent name
    // when getAgentConfigKey called
    // then returns lowercased
    expect(getAgentConfigKey("Custom-Agent")).toBe("custom-agent")
  })

  it("resolves all core agent display names", () => {
    // given all core display names
    // when/then each resolves to its config key
    expect(getAgentConfigKey("Design Worker")).toBe("hephaestus")
    expect(getAgentConfigKey("Prometheus (Plan Builder)")).toBe("prometheus")
    expect(getAgentConfigKey("Comment Conductor")).toBe("atlas")
    expect(getAgentConfigKey("Comment Planner")).toBe("metis")
    expect(getAgentConfigKey("Vision Reviewer")).toBe("momus")
    expect(getAgentConfigKey("Canvas Executor")).toBe("sisyphus-junior")
  })

  it("resolves atlas even when the UI ordering prefix is present", () => {
    expect(getAgentConfigKey(getAgentListDisplayName("atlas"))).toBe("atlas")
  })
})

describe("getAgentListDisplayName", () => {
  it("keeps sisyphus unchanged for list display", () => {
    expect(getAgentListDisplayName("sisyphus")).toBe("Solacy (Design Lead)")
  })

  it("applies invisible atlas sort prefix for list display", () => {
    expect(getAgentListDisplayName("atlas")).toBe("\u200BComment Conductor")
  })
})

describe("normalizeAgentForPrompt", () => {
  it("strips atlas UI ordering prefix back to canonical display name", () => {
    expect(normalizeAgentForPrompt(getAgentListDisplayName("atlas"))).toBe("Comment Conductor")
  })
})

describe("AGENT_DISPLAY_NAMES", () => {
  it("contains all expected agent mappings", () => {
    // given expected mappings
    const expectedMappings = {
      sisyphus: "Solacy (Design Lead)",
      hephaestus: "Design Worker",
      prometheus: "Prometheus (Plan Builder)",
      atlas: "Comment Conductor",
      "sisyphus-junior": "Canvas Executor",
      metis: "Comment Planner",
      momus: "Vision Reviewer",
      athena: "Athena (Council)",
      "athena-junior": "Athena-Junior (Council)",
      oracle: "Design Auditor",
      librarian: "Librarian",
      explore: "Explore",
      "multimodal-looker": "Multimodal Looker",
      "council-member": "council-member",
    }

    // when checking the constant
    // then contains all expected mappings
    expect(AGENT_DISPLAY_NAMES).toEqual(expectedMappings)
  })
})
