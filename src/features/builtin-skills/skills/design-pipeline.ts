import type { BuiltinSkill } from "../types";

export function createDesignPipelineSkill(): BuiltinSkill {
  return {
    name: "design-pipeline",
    description:
      "Structured 4-phase workflow for classifying, planning, executing, and verifying Figma comment resolution",
    template: `# Design Pipeline

Use this workflow to resolve Figma comments with a strict routed pipeline. Be decisive, structured, and scope-safe.

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

Edit intents are exactly:
- full_redesign
- text_only
- frame_props_only
- create_variants

## PHASE 1 - CLASSIFY

Read the WHOLE comment thread plus the pre-gathered context from the initial prompt. Do not classify from the triggering message alone.

Determine:
- Edit Intent: one of the 4 edit intents above
- Request Type: one of the 8 request types above
- Difficulty: easy | medium | hard
- Scope Mode: node_only | subtree
- Target Node: pinned nodeId when available, otherwise none

Intent routing rules:
- text_only: the user only wants copy/text changes. You MUST inspect the full target frame and its children before editing. Only existing text nodes may be changed.
- frame_props_only: the user wants property-only edits on the target frame/component subtree. You may change layout, fill, stroke, radius, spacing, size, position, visibility, opacity, and similar properties, but NOT text content or structure.
- create_variants: the user wants options/variants. You MUST create sibling clone frames/components first and keep the original target untouched after classification.
- full_redesign: the user wants a broader structural or design change inside the target subtree. In-place subtree mutation is allowed.

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
- Edit Intent: [full_redesign | text_only | frame_props_only | create_variants]
- Request Type: [copy_change | token_bind | color_update | spacing_fix | typography_update | layout_change | new_component | design_improvement]
- Difficulty: [easy | medium | hard]
- Confidence: [0-100]
- Routing: [proceed | retry_with_variants | clarify]
- Scope Mode: [node_only | subtree]
- Target Node: [nodeId or "none"]

## PHASE 2 - PLAN

Planning starts with context discipline:
- Read the full thread, not just the tagged comment
- Derive thread root ID: parent_id if present, otherwise the triggering comment ID
- If a target node is available, gather Figma context in ONE compound bash call, not multiple agent turns

Recommended compound context call:
\`\`\`bash
figma-daemon status && echo "---SEPARATOR---" && \
figma-daemon node tree <nodeId> --depth 3 && echo "---SEPARATOR---" && \
figma-daemon export jsx <nodeId> --pretty && echo "---SEPARATOR---" && \
figma-daemon node bindings <nodeId> && echo "---SEPARATOR---" && \
figma-daemon export node <nodeId> --output /tmp/before.png
\`\`\`

Planning rules:
- Easy + proceed: plan a single direct patch with no variants
- Medium + proceed: plan 2 variants
- Hard + proceed: plan 3 variants
- retry_with_variants: proceed with variants regardless of difficulty
- clarify: reply on the thread with 1-3 precise clarification questions, then STOP. Do not mutate canvas and do not resolve.

Intent-specific planning rules:
- text_only: gather the full frame subtree context before editing so text changes stay semantically consistent with surrounding labels and hierarchy.
- frame_props_only: gather the frame subtree and plan property setters only. No render/import/create/clone/delete steps.
- create_variants: plan sibling clone creation first, then plan edits only against the new clone IDs. Never plan an in-place edit to the original target.
- full_redesign: plan the smallest structural change that resolves the comment while staying inside the target subtree.

Context gathering strategy by task type:
- Patch tasks (copy_change, token_bind, color_update, spacing_fix, typography_update): run LIGHTWEIGHT context using status, node tree, export jsx, and node bindings
- Creation tasks (new_component, layout_change, design_improvement): run FULL context using lightweight context plus analyze colors, analyze typography, page bounds, and variable find

Before execution, write a short plan that states:
- selected strategy
- variant count
- target node
- exact commands you expect to use
- why the change should satisfy the comment

Output this exact artifact before any mutation:

\`\`\`
## Design Plan
- Request ID: [stable request id]
- Source Type: [comment | direct-design-task]
- Target Node: [nodeId or "none"]
- Thread ID: [threadRootId or "none"]
- Request Type: [copy_change | token_bind | color_update | spacing_fix | typography_update | layout_change | new_component | design_improvement]
- Edit Intent: [full_redesign | text_only | frame_props_only | create_variants]
- Difficulty: [easy | medium | hard]
- Plan Mode: [micro | full]
- Created By: [planner agent]
- Status: [ready | clarify]
### Mutation Steps
- [ordered mutation step]
### Verification Steps
- [ordered verification step]
### Review Requirements
- [Vision Reviewer | Design Auditor | both]
### Memory Context Refs
- [memory file or "none"]
\`\`\`

## PHASE 3 - EXECUTE

Scope lock:
- ONLY modify the target node and its descendants
- Exception: if Edit Intent = create_variants, create sibling clones from the target first, then mutate ONLY those approved clone IDs
- Never touch unrelated parents or siblings
- Never mutate without both the Classification block and the Design Plan block present in session context

Intent gate:
- text_only: ONLY edit existing text nodes. Allowed commands are limited to text setters and text styling on those nodes.
- frame_props_only: ONLY edit frame subtree properties. Never change text content and never perform structural mutations.
- create_variants: clone the original target into new sibling frames/components, rename the clones clearly, position them beside the source, and mutate ONLY those clones afterward.
- full_redesign: broader subtree edits are allowed, but still stay inside the target subtree and verify the result.

Execution rules by task type:
- copy_change: use \`figma-daemon set text <nodeId> "new text"\` ONLY
- token_bind: use \`figma-daemon set fill <nodeId> $Variable\` and ALWAYS use variable syntax, never hex
- color_update: use \`figma-daemon set fill <nodeId> $Variable\` or \`figma-daemon set stroke <nodeId> $Variable\`
- spacing_fix: use \`figma-daemon set layout <nodeId> --gap N --padding N\`
- typography_update: use \`figma-daemon set font <nodeId> --family X --size N --weight W\`
- layout_change: use figma-daemon set layout or render with JSX for structural changes
- new_component: first run \`figma-daemon export jsx <nodeId> --pretty\`, understand the current structure, then render the improved version with \`figma-daemon render\`
- design_improvement: export, understand, plan the improvement, then render the new version

Variant rules:
1. If Edit Intent = \`create_variants\`, do NOT create a Figma component set unless the user explicitly asked for one.
2. Clone the source frame/component into sibling variants first.
3. Keep the original source untouched after cloning.
4. Only rename/move/resize/set properties on the approved clone IDs.

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

Reply rules:
- If the score is acceptable, reply to the thread root and leave it open for human review
- If the score is not acceptable and this is the first attempt, loop back to EXECUTE with corrections
- If the score is still not acceptable after retry, reply with the partial result and explain what was done and what remains

Threading rules:
- ALWAYS reply after verification succeeds
- Use the thread root ID: parent_id if present, otherwise the triggering comment ID
- Reply with \`--reply <threadRootId>\`, never \`--reply <commentId>\`
- If Routing = clarify, reply with the question(s) and STOP. Do not resolve.
- NEVER resolve Figma comments in autonomous design-agent workflows
- Leave the thread open for human review after your reply

Use this command when verification succeeds:
- \`figma-daemon comment add "<summary of what changed and why>" --reply <threadRootId>\`

Stay inside the pipeline: classify first, plan second, execute third, verify last.`,
  };
}
