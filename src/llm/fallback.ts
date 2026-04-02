import type { LLMRequest, LLMResponse } from "./types.js";
import type { AdapterRegistry } from "./registry.js";

interface FallbackConfig {
  registry: AdapterRegistry;
  chain: string[];
  timeout: number;
  staticResponses?: Record<string, string>;
  onAllFailed?: () => void;
}

export class FallbackChain {
  private readonly config: FallbackConfig;

  constructor(config: FallbackConfig) {
    this.config = config;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const errors: Error[] = [];
    for (const providerModel of this.config.chain) {
      try {
        const { adapter, model } = this.config.registry.resolveWithModel(providerModel);
        const result = await this.withTimeout(
          adapter.complete({ ...request, model }),
          this.config.timeout,
        );
        return result;
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }

    if (this.config.staticResponses) {
      const lastMessage = request.messages[request.messages.length - 1];
      const content = lastMessage?.content ?? "";
      for (const [pattern, response] of Object.entries(this.config.staticResponses)) {
        if (pattern === "default") continue;
        if (content.toLowerCase().includes(pattern.toLowerCase())) {
          return { content: response, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
        }
      }
      if (this.config.staticResponses.default) {
        return { content: this.config.staticResponses.default, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
      }
    }

    this.config.onAllFailed?.();
    throw new AggregateError(errors, `All ${this.config.chain.length} models failed`);
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
      promise.then(
        (val) => { clearTimeout(timer); resolve(val); },
        (err) => { clearTimeout(timer); reject(err); },
      );
    });
  }
}
