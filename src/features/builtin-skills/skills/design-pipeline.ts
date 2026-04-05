import type { BuiltinSkill } from "../types";

export function createDesignPipelineSkill(): BuiltinSkill {
  return {
    name: "design-pipeline",
    description:
      "Structured 4-phase workflow for classifying, planning, executing, and verifying Figma comment resolution",
    template: `# Design Pipeline

Use this workflow to resolve Figma comments with a strict 4-phase pipeline. Be decisive, structured, and scope-safe.

## Task-Type Routing Table

copy_change: easy | node_only | no-memory | light audit
token_bind: easy | node_only | no-memory | light audit
color_update: easy | subtree | no-memory | light audit
spacing_fix: easy | subtree | no-memory | light audit
typography_update: medium | subtree | no-memory | standard audit
layout_change: medium | subtree | needs-memory | standard audit
new_component: hard | subtree | needs-memory | full audit
design_improvement: hard | subtree | needs-memory | full audit

Request types are exactly:
- copy_change
- token_bind
- color_update
- spacing_fix
- typography_update
- layout_change
- new_component
- design_improvement

## PHASE 1 - CLASSIFY

Read the comment message and the pre-gathered context from the initial prompt.

Determine:
- Request Type: one of the 8 request types above
- Difficulty: easy | medium | hard
- Scope Mode: node_only | subtree
- Target Node: pinned nodeId when available, otherwise none

Confidence scoring rubric:
- Pinned node present: +30 points
- Request is unambiguous (single clear action): +20 points
- Single property change: +15 points
- Design memory loaded and relevant: +10 points
- Canvas context (node tree/JSX) available: +10 points
- Ambiguous target (multiple candidates): -20 points
- Conflicting requirements in comment: -15 points
- No pinned node and vague target: -30 points

Routing thresholds:
- 72 or higher -> proceed
- 30 to 71 -> retry_with_variants
- Below 30 -> clarify

Output exactly this block:

## Classification
- Request Type: [type]
- Difficulty: [easy/medium/hard]
- Confidence: [0-100]
- Routing: [proceed | retry_with_variants | clarify]
- Scope Mode: [node_only | subtree]
- Target Node: [nodeId or "none"]

## PHASE 2 - PLAN

Planning rules:
- Easy + proceed: plan a single direct patch with no variants
- Medium + proceed: plan 2 variants
- Hard + proceed: plan 3 variants
- retry_with_variants: proceed with variants regardless of difficulty
- clarify: reply to the comment asking for clarification, then STOP and do not mutate canvas

Context gathering strategy by task type:
- Patch tasks (copy_change, token_bind, color_update, spacing_fix, typography_update): run LIGHTWEIGHT context using status, node tree, export jsx, and node bindings
- Creation tasks (new_component, layout_change, design_improvement): run FULL context using lightweight context plus analyze colors, analyze typography, page bounds, and variable find

Before execution, write a short plan that states:
- selected strategy
- variant count
- target node
- exact commands you expect to use
- why the change should satisfy the comment

## PHASE 3 - EXECUTE

Scope lock: ONLY modify the target node and its descendants. Never touch sibling or parent nodes.

Execution rules by task type:
- copy_change: use \`figma-daemon set text <nodeId> "new text"\` ONLY
- token_bind: use \`figma-daemon set fill <nodeId> $Variable\` and ALWAYS use variable syntax, never hex
- color_update: use \`figma-daemon set fill <nodeId> $Variable\` or \`figma-daemon set stroke <nodeId> $Variable\`
- spacing_fix: use \`figma-daemon set layout <nodeId> --gap N --padding N\`
- typography_update: use \`figma-daemon set font <nodeId> --family X --size N --weight W\`
- layout_change: use figma-daemon set layout or render with JSX for structural changes
- new_component: first run \`figma-daemon export jsx <nodeId> --pretty\`, understand the current structure, then render the improved version with \`figma-daemon render\`
- design_improvement: export, understand, plan the improvement, then render the new version

JSX rendering rules for new_component and layout_change:
1. ALWAYS export existing node first with \`figma-daemon export jsx <nodeId> --pretty\`
2. Use \`$Variable\` syntax for ALL colors and never hardcode hex
3. Position with \`--x\` and \`--y\` always
4. Use \`defineComponent\` for reusable elements
5. After render, check the result with \`figma-daemon export node <newId> --output /tmp/check.png\`

After ANY mutation, collect verification data:
- \`figma-daemon export node <nodeId> --output /tmp/after.png\`
- \`figma-daemon lint --root <nodeId> -v\`
- \`figma-daemon node bindings <nodeId>\`

## PHASE 4 - VERIFY

Verification steps:
- Compare before.png and after.png if both are present
- Score whether the change resolves the original comment with yes/no plus explanation
- Check token binding hygiene and flag unbound hex values
- Pass \`figma-daemon lint --root <nodeId>\` output through a compliance check

Resolution rules:
- If the score is acceptable, reply to the thread and then resolve it
- If the score is not acceptable and this is the first attempt, loop back to EXECUTE with corrections
- If the score is still not acceptable after retry, reply with the partial result and explain what was done and what remains

Threading rules:
- ALWAYS reply BEFORE resolving
- Reply with \`--reply <threadId>\`, never \`--reply <commentId>\`
- NEVER resolve without a prior reply in the same thread

Use these commands in order when verification succeeds:
- \`figma-daemon comment add "<summary of what changed and why>" --reply <threadId>\`
- \`figma-daemon comment resolve <threadId>\`

Stay inside the pipeline: classify first, plan second, execute third, verify last.`,
  };
}
