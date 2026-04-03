import { z } from "zod"

export const DesignMemoryFileTypeSchema = z.enum([
  "design_style",
  "product_context",
  "user_behavior",
  "copy_context",
  "historical_learnings",
  "custom",
])

export const DesignMemoryFileSchema = z.object({
  path: z.string(),
  type: DesignMemoryFileTypeSchema.default("custom"),
  priority: z.number().int().min(0).max(100).default(50),
  tags: z.array(z.string()).default([]),
  max_chars: z.number().int().positive().optional(),
  required: z.boolean().default(false),
})

export const DesignMemoryConfigSchema = z.object({
  enabled: z.boolean().default(false),
  docs_first: z.boolean().default(true),
  docs_root: z.string().default("docs"),
  docs_globs: z.array(z.string()).default([
    "**/*.md",
    "**/*.mdx",
    "**/*.txt",
    "**/*.json",
    "**/*.jsonc",
    "**/*.yaml",
    "**/*.yml",
  ]),
  prefer_docs_types: z.array(DesignMemoryFileTypeSchema).default([]),
  auto_load_for_comment_resolution: z.boolean().default(true),
  max_docs_files: z.number().int().positive().default(4),
  files: z.array(DesignMemoryFileSchema).default([]),
  max_chars_per_file: z.number().int().positive().default(2400),
  max_total_chars: z.number().int().positive().default(9600),
})

export type DesignMemoryFileType = z.infer<typeof DesignMemoryFileTypeSchema>
export type DesignMemoryFile = z.infer<typeof DesignMemoryFileSchema>
export type DesignMemoryConfig = z.infer<typeof DesignMemoryConfigSchema>
