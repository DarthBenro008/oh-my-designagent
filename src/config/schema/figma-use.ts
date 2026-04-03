import { z } from "zod"

export const FigmaUseConfigSchema = z.object({
  enabled: z.boolean().default(false),
  mcp_server_name: z.string().default("figma-use"),
  require_status_check: z.boolean().default(true),
  url: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
})

export type FigmaUseConfig = z.infer<typeof FigmaUseConfigSchema>
