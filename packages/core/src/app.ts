import type { FlowEvent, HookDefinition } from "./types.js";
import type { LLMAdapter } from "./llm/types.js";
import type { ToolDefinition } from "./tools/types.js";
import type { ConversationStore } from "./store/types.js";
import type { TokenManagerOptions } from "./tokens/manager.js";
import type { ContextCompactionConfig } from "./conversation.js";
import { compile } from "./compiler.js";
import { runConversation } from "./runtime.js";
import { FlowBuilder } from "./flow.js";
import { AdapterRegistry } from "./llm/registry.js";
import { SystemPromptBuilder } from "./llm/prompts.js";
import { Conversation } from "./conversation.js";
import { SessionManager } from "./channels/session-manager.js";
import { RestApiAdapter } from "./channels/rest-api.js";

interface TalkGraphConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- type erasure: accepts any flow state schema
  flows: FlowBuilder<any>[];
  tools?: ToolDefinition[];
  adapters?: LLMAdapter[];
  defaultModel?: string;
  systemPrompt?: string;
  api?: { port: number };
  store?: ConversationStore;
  tokenManager?: TokenManagerOptions;
  compaction?: ContextCompactionConfig;
  hooks?: HookDefinition[];
}

export class TalkGraphApp {
  private readonly flows: Map<string, ReturnType<typeof compile>>;
  private readonly tools: Map<string, ToolDefinition>;
  private readonly registry: AdapterRegistry;
  private readonly globalSystemPrompt?: string;
  private readonly config_: TalkGraphConfig;
  private readonly store_?: ConversationStore;

  constructor(config: TalkGraphConfig) {
    this.config_ = config;
    this.store_ = config.store;
    this.flows = new Map();
    for (const builder of config.flows) {
      const def = builder.build();
      const compiled = compile(def);
      this.flows.set(compiled.name, compiled);
    }
    this.tools = new Map();
    for (const tool of config.tools ?? []) {
      this.tools.set(tool.name, tool);
    }
    this.registry = new AdapterRegistry();
    for (const adapter of config.adapters ?? []) {
      this.registry.register(adapter);
    }
    if (config.defaultModel) {
      this.registry.setDefault(config.defaultModel);
    }
    this.globalSystemPrompt = config.systemPrompt;
  }

  run(
    flowName: string,
    input?: { text?: string },
    sessionId?: string,
  ): AsyncGenerator<FlowEvent> {
    const compiled = this.flows.get(flowName);
    if (!compiled) {
      throw new Error(`Flow "${flowName}" not found. Available: ${[...this.flows.keys()].join(", ")}`);
    }
    const sid = sessionId ?? `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return runConversation(compiled, sid, undefined, {
      adapterRegistry: this.registry.list().length > 0 ? this.registry : undefined,
      systemPromptBuilder: this.globalSystemPrompt
        ? new SystemPromptBuilder({ global: this.globalSystemPrompt })
        : undefined,
    });
  }

  createConversation(flowName: string, sessionId?: string): Conversation {
    const compiled = this.flows.get(flowName);
    if (!compiled) throw new Error(`Flow "${flowName}" not found. Available: ${[...this.flows.keys()].join(", ")}`);
    const sid = sessionId ?? `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return new Conversation({
      compiled,
      sessionId: sid,
      adapterRegistry: this.registry.list().length > 0 ? this.registry : undefined,
      systemPromptBuilder: this.globalSystemPrompt
        ? new SystemPromptBuilder({ global: this.globalSystemPrompt })
        : undefined,
      tokenManager: this.config_.tokenManager,
      compaction: this.config_.compaction,
      hooks: this.config_.hooks,
    });
  }

  async listen(): Promise<{ stop: () => Promise<void> }> {
    const sessionManager = new SessionManager({
      compiledFlows: this.flows,
      adapterRegistry: this.registry.list().length > 0 ? this.registry : undefined,
      systemPromptBuilder: this.globalSystemPrompt
        ? new SystemPromptBuilder({ global: this.globalSystemPrompt })
        : undefined,
      store: this.store_,
      hooks: this.config_.hooks,
    });

    const toStop: Array<{ stop: () => Promise<void> }> = [];

    if (this.config_.api) {
      const restApi = new RestApiAdapter({
        port: this.config_.api.port,
        sessionManager,
      });
      await restApi.start();
      toStop.push(restApi);
    }

    return {
      stop: async () => {
        for (const s of toStop) await s.stop();
      },
    };
  }

  listFlows(): string[] {
    return [...this.flows.keys()];
  }
}

export function createTalkGraph(config: TalkGraphConfig): TalkGraphApp {
  return new TalkGraphApp(config);
}
