import type { LLMAdapter } from "./types.js";

export class AdapterRegistry {
  private readonly adapters = new Map<string, LLMAdapter>();
  private defaultModel: string | null = null;

  register(adapter: LLMAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  resolve(providerModel: string): LLMAdapter {
    const provider = providerModel.split(":")[0];
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(
        `No adapter registered for provider "${provider}". Available: ${[...this.adapters.keys()].join(", ")}`,
      );
    }
    return adapter;
  }

  resolveWithModel(providerModel: string): { adapter: LLMAdapter; model: string } {
    const [provider, ...rest] = providerModel.split(":");
    const model = rest.join(":");
    return { adapter: this.resolve(providerModel), model };
  }

  setDefault(providerModel: string): void {
    this.defaultModel = providerModel;
  }

  resolveDefault(): { adapter: LLMAdapter; model: string } {
    if (!this.defaultModel) {
      throw new Error("No default model configured");
    }
    return this.resolveWithModel(this.defaultModel);
  }

  list(): string[] {
    return [...this.adapters.keys()];
  }
}
