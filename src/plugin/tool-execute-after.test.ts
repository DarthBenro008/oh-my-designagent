import { describe, expect, it } from "bun:test"
import { createToolExecuteAfterHandler } from "./tool-execute-after"

describe("createToolExecuteAfterHandler", () => {
  it("runs post-render-qa before truncation so it sees full tool output", async () => {
    const callOrder: string[] = []
    let postRenderSawOutput = ""

    const handler = createToolExecuteAfterHandler({
      ctx: { directory: "/repo" } as never,
      hooks: {
        postRenderQa: {
          "tool.execute.after": async (_input, output) => {
            callOrder.push("post-render-qa")
            postRenderSawOutput = output.output
          },
        },
        toolOutputTruncator: {
          "tool.execute.after": async (_input, output) => {
            callOrder.push("truncator")
            output.output = "truncated output"
          },
        },
      } as never,
    })

    await handler(
      { tool: "bash", sessionID: "ses_test", callID: "call_test" },
      { title: "result", output: "original output", metadata: {} }
    )

    expect(callOrder).toEqual(["post-render-qa", "truncator"])
    expect(postRenderSawOutput).toBe("original output")
  })

  it("#given truncator changes output #when tool.execute.after runs #then claudeCodeHooks receives truncated output", async () => {
    const callOrder: string[] = []
    let claudeSawOutput = ""

    const handler = createToolExecuteAfterHandler({
      ctx: { directory: "/repo" } as never,
      hooks: {
        toolOutputTruncator: {
          "tool.execute.after": async (_input, output) => {
            callOrder.push("truncator")
            output.output = "truncated output"
          },
        },
        claudeCodeHooks: {
          "tool.execute.after": async (_input, output) => {
            callOrder.push("claude")
            claudeSawOutput = output.output
          },
        },
      } as never,
    })

    await handler(
      { tool: "hashline_edit", sessionID: "ses_test", callID: "call_test" },
      { title: "result", output: "original output", metadata: {} }
    )

    expect(callOrder).toEqual(["truncator", "claude"])
    expect(claudeSawOutput).toBe("truncated output")
  })
})
