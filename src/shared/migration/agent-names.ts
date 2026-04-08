export const AGENT_NAME_MAP: Record<string, string> = {
  // Sisyphus variants → "sisyphus"
  omo: "sisyphus",
  OmO: "sisyphus",
  Sisyphus: "sisyphus",
  sisyphus: "sisyphus",
  solacy: "sisyphus",
  Solacy: "sisyphus",
  "Sisyphus (Ultraworker)": "sisyphus",
  "sisyphus (ultraworker)": "sisyphus",

  // Prometheus variants → "prometheus"
  "OmO-Plan": "prometheus",
  "omo-plan": "prometheus",
  "Planner-Sisyphus": "prometheus",
  "planner-sisyphus": "prometheus",
  "Prometheus (Planner)": "prometheus",
  prometheus: "prometheus",

  // Atlas variants → "atlas"
  "orchestrator-sisyphus": "atlas",
  Atlas: "atlas",
  atlas: "atlas",
  "comment-conductor": "atlas",
  "Comment Conductor": "atlas",
  "Atlas (Plan Executor)": "atlas",
  "atlas (plan executor)": "atlas",

  // Metis variants → "metis"
  "plan-consultant": "metis",
  "Metis (Plan Consultant)": "metis",
  metis: "metis",
  "comment-planner": "metis",
  "Comment Planner": "metis",
  "metis (plan consultant)": "metis",

  // Momus variants → "momus"
  "Momus (Plan Reviewer)": "momus",
  momus: "momus",
  "vision-reviewer": "momus",
  "Vision Reviewer": "momus",
  "Momus (Plan Critic)": "momus",
  "momus (plan critic)": "momus",

  // Sisyphus-Junior → "sisyphus-junior"
  "Sisyphus-Junior": "sisyphus-junior",
  "sisyphus-junior": "sisyphus-junior",
  "canvas-executor": "sisyphus-junior",
  "Canvas Executor": "sisyphus-junior",

  // Already lowercase - passthrough
  build: "build",
  oracle: "oracle",
  "design-auditor": "oracle",
  "Design Auditor": "oracle",
  "Hephaestus (Deep Agent)": "hephaestus",
  "hephaestus (deep agent)": "hephaestus",
  librarian: "librarian",
  explore: "explore",
  hephaestus: "hephaestus",
  "design-worker": "hephaestus",
  "Design Worker": "hephaestus",
  "multimodal-looker": "multimodal-looker",
}

export const BUILTIN_AGENT_NAMES = new Set([
  "sisyphus", // was "Sisyphus"
  "oracle",
  "librarian",
  "explore",
  "multimodal-looker",
  "metis", // was "Metis (Plan Consultant)"
  "momus", // was "Momus (Plan Reviewer)"
  "prometheus", // was "Prometheus (Planner)"
  "atlas", // was "Atlas"
  "build",
])

export function migrateAgentNames(
  agents: Record<string, unknown>
): { migrated: Record<string, unknown>; changed: boolean } {
  const migrated: Record<string, unknown> = {}
  let changed = false

  for (const [key, value] of Object.entries(agents)) {
    const newKey = AGENT_NAME_MAP[key.toLowerCase()] ?? AGENT_NAME_MAP[key] ?? key
    if (newKey !== key) {
      changed = true
    }
    migrated[newKey] = value
  }

  return { migrated, changed }
}
