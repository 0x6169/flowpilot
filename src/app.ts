import type { FlowEvent } from "./types.js";
import type { LLMAdapter } from "./llm/types.js";
import type { ToolDefinition } from "./tools/types.js";
import { compile } from "./compiler.js";
import { runConversation } from "./runtime.js";
import { FlowBuilder } from "./flow.js";
import { AdapterRegistry } from "./llm/registry.js";
import { SystemPromptBuilder } from "./llm/prompts.js";
import { Conversation } from "./conversation.js";

interface FlowPilotConfig {
  flows: FlowBuilder<any>[];
  tools?: ToolDefinition[];
  adapters?: LLMAdapter[];
  defaultModel?: string;
  systemPrompt?: string;
}

export class FlowPilotApp {
  private readonly flows: Map<string, ReturnType<typeof compile>>;
  private readonly tools: Map<string, ToolDefinition>;
  private readonly registry: AdapterRegistry;
  private readonly globalSystemPrompt?: string;

  constructor(config: FlowPilotConfig) {
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
    });
  }

  listFlows(): string[] {
    return [...this.flows.keys()];
  }
}

export function createFlowPilot(config: FlowPilotConfig): FlowPilotApp {
  return new FlowPilotApp(config);
}
