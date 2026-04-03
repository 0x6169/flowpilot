import type { z } from "zod";

export interface ToolDefinition<I = unknown, O = unknown> {
  name: string;
  description: string;
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  concurrent: boolean;
  retry?: { maxAttempts: number; backoff: "exponential" | "linear" };
  run(input: unknown): Promise<O>;
}

export interface ToolCallRequest {
  toolName: string;
  input: unknown;
}

export interface ToolCallResult {
  toolName: string;
  output: unknown;
  duration: number;
  error?: string;
}
