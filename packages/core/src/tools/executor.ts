import type { ToolDefinition, ToolCallRequest, ToolCallResult } from "./types.js";

export class ToolExecutor {
  private readonly tools: Map<string, ToolDefinition>;

  constructor(tools: ToolDefinition[]) {
    this.tools = new Map(tools.map((t) => [t.name, t]));
  }

  async runAll(calls: ToolCallRequest[]): Promise<ToolCallResult[]> {
    const concurrent: Array<{ index: number; call: ToolCallRequest }> = [];
    const serial: Array<{ index: number; call: ToolCallRequest }> = [];

    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      const tool = this.tools.get(call.toolName);
      if (!tool) {
        throw new Error(`Unknown tool: "${call.toolName}"`);
      }
      if (tool.concurrent) {
        concurrent.push({ index: i, call });
      } else {
        serial.push({ index: i, call });
      }
    }

    const results: ToolCallResult[] = new Array(calls.length);

    if (concurrent.length > 0) {
      const concurrentResults = await Promise.all(
        concurrent.map(({ call }) => this.runOne(call)),
      );
      for (let i = 0; i < concurrent.length; i++) {
        results[concurrent[i].index] = concurrentResults[i];
      }
    }

    for (const { index, call } of serial) {
      results[index] = await this.runOne(call);
    }

    return results;
  }

  private async runOne(call: ToolCallRequest): Promise<ToolCallResult> {
    const tool = this.tools.get(call.toolName)!;
    const start = Date.now();
    try {
      const output = await tool.run(call.input);
      return { toolName: call.toolName, output, duration: Date.now() - start };
    } catch (err) {
      return {
        toolName: call.toolName,
        output: null,
        duration: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
