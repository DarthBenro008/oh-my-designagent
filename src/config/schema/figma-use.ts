import { z } from "zod";

export const FigmaUseModeSchema = z.enum(["mcp", "cli"]).default("mcp");

export const FigmaUseConfigSchema = z.object({
  enabled: z.boolean().default(false),
  mode: FigmaUseModeSchema,
  mcp_server_name: z.string().default("figma-daemon"),
  require_status_check: z.boolean().default(true),
  url: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
});

export type FigmaUseMode = z.infer<typeof FigmaUseModeSchema>;
export type FigmaUseConfig = z.infer<typeof FigmaUseConfigSchema>;
