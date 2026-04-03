import type { BuiltinSkill } from "./types"
import type { BrowserAutomationProvider } from "../../config/schema"
import type { FigmaUseConfig } from "../../config"

import {
  playwrightSkill,
  agentBrowserSkill,
  playwrightCliSkill,
  createFigmaUseSkill,
  frontendUiUxSkill,
  gitMasterSkill,
  devBrowserSkill,
  reviewWorkSkill,
  aiSlopRemoverSkill,
} from "./skills/index"

export interface CreateBuiltinSkillsOptions {
  browserProvider?: BrowserAutomationProvider
  figmaUseConfig?: FigmaUseConfig
  disabledSkills?: Set<string>
}

export function createBuiltinSkills(options: CreateBuiltinSkillsOptions = {}): BuiltinSkill[] {
  const { browserProvider = "playwright", figmaUseConfig, disabledSkills } = options

  let browserSkill: BuiltinSkill
  if (browserProvider === "agent-browser") {
    browserSkill = agentBrowserSkill
  } else if (browserProvider === "playwright-cli") {
    browserSkill = playwrightCliSkill
  } else {
    browserSkill = playwrightSkill
  }

  const skills = [browserSkill, frontendUiUxSkill, gitMasterSkill, devBrowserSkill, reviewWorkSkill, aiSlopRemoverSkill]
  if (figmaUseConfig?.enabled) {
    skills.push(createFigmaUseSkill(figmaUseConfig))
  }

  if (!disabledSkills) {
    return skills
  }

  return skills.filter((skill) => !disabledSkills.has(skill.name))
}
