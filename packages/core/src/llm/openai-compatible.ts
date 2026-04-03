import OpenAI from "openai";
import type { LLMAdapter, LLMRequest, LLMResponse, LLMEvent } from "./types.js";

interface OpenAICompatibleConfig {
  name: string;
  baseUrl: string;
  apiKey?: string;
}

export class OpenAICompatibleAdapter implements LLMAdapter {
  readonly name: string;
  readonly capabilities = {
    streaming: true,
    toolUse: false,
    vision: false,
    jsonMode: false,
  };

  private readonly client: OpenAI;

  constructor(config: OpenAICompatibleConfig) {
    this.name = config.name;
    this.client = new OpenAI({
      apiKey: config.apiKey ?? "not-needed",
      baseURL: config.baseUrl,
    });
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const params: OpenAI.ChatCompletionCreateParamsNonStreaming = { ...this.buildParams(request), stream: false };
    const response = await this.client.chat.completions.create(params);
    const content = response.choices[0]?.message?.content ?? "";
    return {
      content,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
    };
  }

  async *stream(request: LLMRequest): AsyncGenerator<LLMEvent> {
    const params: OpenAI.ChatCompletionCreateParamsStreaming = { ...this.buildParams(request), stream: true };
    const stream = await this.client.chat.completions.create(params);
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield { type: "token", text: delta };
    }
    yield { type: "done", usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
  }

  private buildParams(request: LLMRequest): Omit<OpenAI.ChatCompletionCreateParams, "stream"> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [];
    if (request.systemPrompt) messages.push({ role: "system", content: request.systemPrompt });
    for (const msg of request.messages) messages.push({ role: msg.role, content: msg.content });
    return {
      model: request.model,
      messages,
      max_tokens: request.maxTokens ?? 4096,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    };
  }
}
