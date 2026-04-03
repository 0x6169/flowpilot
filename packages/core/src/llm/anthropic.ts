import Anthropic from "@anthropic-ai/sdk";
import type { LLMAdapter, LLMRequest, LLMResponse, LLMEvent } from "./types.js";

interface AnthropicConfig {
  apiKey: string;
  baseUrl?: string;
}

export class AnthropicAdapter implements LLMAdapter {
  readonly name = "anthropic";
  readonly capabilities = {
    streaming: true,
    toolUse: true,
    vision: true,
    jsonMode: false,
  };

  private readonly client: Anthropic;

  constructor(config: AnthropicConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      ...this.buildParams(request),
      stream: false,
    };
    const response = await this.client.messages.create(params);
    const content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    return {
      content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  async *stream(request: LLMRequest): AsyncGenerator<LLMEvent> {
    const params = this.buildParams(request);
    const stream = this.client.messages.stream(params);
    let inputTokens = 0;
    let outputTokens = 0;
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "token", text: event.delta.text };
      } else if (event.type === "message_delta" && event.usage) {
        outputTokens = event.usage.output_tokens;
      } else if (event.type === "message_start" && event.message.usage) {
        inputTokens = event.message.usage.input_tokens;
      }
    }
    yield { type: "done", usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens } };
  }

  private buildParams(request: LLMRequest): Anthropic.MessageCreateParams {
    return {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      messages: request.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      ...(request.systemPrompt ? { system: request.systemPrompt } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    };
  }
}
