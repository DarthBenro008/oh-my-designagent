import { z } from "zod";

export const DesignPipelineConfigSchema = z.object({
  enabled: z.boolean().default(true),
  confidence_proceed_threshold: z.number().min(0).max(100).default(72),
  confidence_retry_threshold: z.number().min(0).max(100).default(30),
  max_variants: z.number().int().min(1).max(5).default(3),
  post_render_qa_enabled: z.boolean().default(true),
  scope_lock_enabled: z.boolean().default(true),
  pre_gather_enabled: z.boolean().default(true),
});

export type DesignPipelineConfig = z.infer<typeof DesignPipelineConfigSchema>;
