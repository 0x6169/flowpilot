import type { LLMAdapter, LLMRequest, LLMResponse, LLMEvent } from "./types.js";

interface OllamaConfig {
  baseUrl: string;
}

interface OllamaMessage {
  role: string;
  content: string;
}

interface OllamaChatResponse {
  message: { role: string; content: string };
  done: boolean;
  total_duration?: number;
  eval_count?: number;
  prompt_eval_count?: number;
}

export class OllamaAdapter implements LLMAdapter {
  readonly name = "ollama";
  readonly capabilities = {
    streaming: true,
    toolUse: false,
    vision: false,
    jsonMode: false,
  };

  private readonly baseUrl: string;

  constructor(config: OllamaConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const body = this.buildBody(request);
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as OllamaChatResponse;
    return {
      content: data.message.content,
      usage: {
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
    };
  }

  async *stream(request: LLMRequest): AsyncGenerator<LLMEvent> {
    const body = { ...this.buildBody(request), stream: true };
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Ollama API error: ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");
    const decoder = new TextDecoder();
    let inputTokens = 0;
    let outputTokens = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      const lines = text.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const data = JSON.parse(line) as OllamaChatResponse;
          if (data.message?.content) yield { type: "token", text: data.message.content };
          if (data.done) {
            inputTokens = data.prompt_eval_count ?? 0;
            outputTokens = data.eval_count ?? 0;
          }
        } catch { /* skip malformed */ }
      }
    }
    yield { type: "done", usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens } };
  }

  private buildBody(request: LLMRequest): Record<string, unknown> {
    const messages: OllamaMessage[] = [];
    if (request.systemPrompt) messages.push({ role: "system", content: request.systemPrompt });
    for (const msg of request.messages) messages.push({ role: msg.role, content: msg.content });
    return {
      model: request.model,
      messages,
      stream: false,
      ...(request.temperature !== undefined ? { options: { temperature: request.temperature } } : {}),
    };
  }
}
