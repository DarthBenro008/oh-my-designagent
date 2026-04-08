import { z } from "zod"

export const FigmaCommentResolutionConfigSchema = z.object({
  enabled: z.boolean().default(false),
  auto_reply: z.boolean().default(true),
  max_variants: z.number().int().min(1).max(5).default(3),
  require_review_above_difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  memory_required_for: z.array(z.string()).default(["new_component", "layout_change", "design_improvement"]),
})

const FIGMA_COMMENT_RESOLUTION_DEFAULTS = FigmaCommentResolutionConfigSchema.parse({})

export const FigmaConfigSchema = z.object({
  comment_resolution: FigmaCommentResolutionConfigSchema.default(FIGMA_COMMENT_RESOLUTION_DEFAULTS),
})

export type FigmaCommentResolutionConfig = z.infer<typeof FigmaCommentResolutionConfigSchema>
export type FigmaConfig = z.infer<typeof FigmaConfigSchema>
