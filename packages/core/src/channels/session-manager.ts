import type { CompiledFlow, HookDefinition } from "../types.js";
import type { AdapterRegistry } from "../llm/registry.js";
import type { SystemPromptBuilder } from "../llm/prompts.js";
import type { ConversationStore } from "../store/types.js";
import { Conversation } from "../conversation.js";

export interface SessionManagerConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- type erasure: holds flows with any state schema
  compiledFlows: Map<string, CompiledFlow<any>>;
  adapterRegistry?: AdapterRegistry;
  systemPromptBuilder?: SystemPromptBuilder;
  store?: ConversationStore;
  hooks?: HookDefinition[];
}

export class SessionManager {
  private readonly sessions = new Map<string, Conversation>();
  private readonly config: SessionManagerConfig;

  constructor(config: SessionManagerConfig) {
    this.config = config;
  }

  getOrCreate(sessionId: string, flowName: string): Conversation {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;
    const compiled = this.config.compiledFlows.get(flowName);
    if (!compiled) throw new Error(`Flow "${flowName}" not found. Available: ${[...this.config.compiledFlows.keys()].join(", ")}`);
    const conv = new Conversation({
      compiled, sessionId,
      store: this.config.store,
      adapterRegistry: this.config.adapterRegistry,
      systemPromptBuilder: this.config.systemPromptBuilder,
      hooks: this.config.hooks,
    });
    this.sessions.set(sessionId, conv);
    return conv;
  }

  get(sessionId: string): Conversation | undefined {
    return this.sessions.get(sessionId);
  }

  remove(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  activeSessions(): string[] {
    return [...this.sessions.keys()];
  }

  getFlowNames(): string[] {
    return [...this.config.compiledFlows.keys()];
  }
}
