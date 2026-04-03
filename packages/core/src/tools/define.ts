import type { z } from "zod";
import type { ToolDefinition } from "./types.js";

interface DefineToolOptions<I, O> {
  name: string;
  description: string;
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  concurrent: boolean;
  retry?: { maxAttempts: number; backoff: "exponential" | "linear" };
  execute: (input: I) => Promise<O>;
}

export function defineTool<I, O>(options: DefineToolOptions<I, O>): ToolDefinition<I, O> {
  return {
    name: options.name,
    description: options.description,
    input: options.input,
    output: options.output,
    concurrent: options.concurrent,
    retry: options.retry,
    async run(rawInput: unknown): Promise<O> {
      const input = options.input.parse(rawInput);
      const rawOutput = await options.execute(input);
      return options.output.parse(rawOutput);
    },
  };
}
