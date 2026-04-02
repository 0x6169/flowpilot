/// <reference types="node" />
import type { LLMAdapter, LLMRequest, LLMResponse, LLMEvent } from "./types.js";
import type { TokenUsage } from "../types.js";

interface MockOptions {
  responses: Record<string, string>;
  tokenDelay?: number;
}

export class MockLLMAdapter implements LLMAdapter {
  readonly name = "mock";
  readonly capabilities = {
    streaming: true,
    toolUse: false,
    vision: false,
    jsonMode: false,
  };

  private readonly responses: Map<string, string>;
  private readonly tokenDelay: number;

  constructor(options: MockOptions) {
    this.responses = new Map(Object.entries(options.responses));
    this.tokenDelay = options.tokenDelay ?? 0;
  }

  async complete(params: LLMRequest): Promise<LLMResponse> {
    const content = this.resolveResponse(params);
    return {
      content,
      usage: this.estimateUsage(params, content),
    };
  }

  async *stream(params: LLMRequest): AsyncGenerator<LLMEvent> {
    const content = this.resolveResponse(params);
    const words = content.split(" ");
    for (let i = 0; i < words.length; i++) {
      const text = i === 0 ? words[i] : " " + words[i];
      if (this.tokenDelay > 0) {
        await new Promise((r) => setTimeout(r, this.tokenDelay));
      }
      yield { type: "token", text };
    }
    yield { type: "done", usage: this.estimateUsage(params, content) };
  }

  private resolveResponse(params: LLMRequest): string {
    const lastMessage = params.messages[params.messages.length - 1];
    const content = lastMessage?.content ?? "";
    for (const [pattern, response] of this.responses) {
      if (pattern === "default") continue;
      if (content.toLowerCase().includes(pattern.toLowerCase())) {
        return response;
      }
    }
    return this.responses.get("default") ?? "Mock response";
  }

  private estimateUsage(params: LLMRequest, output: string): TokenUsage {
    const inputTokens = params.messages.reduce(
      (sum, m) => sum + Math.ceil(m.content.length / 4),
      0,
    );
    const outputTokens = Math.ceil(output.length / 4);
    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    };
  }
}
