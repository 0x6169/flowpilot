import type { TokenUsage } from "../types.js";

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LLMRequest {
  model: string;
  messages: ConversationMessage[];
  tools?: LLMToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type LLMEvent =
  | { type: "token"; text: string }
  | { type: "tool_call"; name: string; input: unknown }
  | { type: "done"; usage: TokenUsage }
  | { type: "error"; error: Error };

export interface LLMResponse {
  content: string;
  usage: TokenUsage;
}

export interface LLMAdapter {
  name: string;
  stream(params: LLMRequest): AsyncGenerator<LLMEvent>;
  complete(params: LLMRequest): Promise<LLMResponse>;
  capabilities: {
    streaming: boolean;
    toolUse: boolean;
    vision: boolean;
    jsonMode: boolean;
  };
}
