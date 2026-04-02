import type { FlowEvent } from "./types.js";
import type { LLMAdapter } from "./llm/types.js";
import type { ToolDefinition } from "./tools/types.js";
import { compile } from "./compiler.js";
import { runConversation } from "./runtime.js";
import { FlowBuilder } from "./flow.js";

interface FlowPilotConfig {
  flows: FlowBuilder<any>[];
  tools?: ToolDefinition[];
  adapters?: LLMAdapter[];
  defaultModel?: string;
}

export class FlowPilotApp {
  private readonly flows: Map<string, ReturnType<typeof compile>>;
  private readonly tools: Map<string, ToolDefinition>;

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
    return runConversation(compiled, sid);
  }

  listFlows(): string[] {
    return [...this.flows.keys()];
  }
}

export function createFlowPilot(config: FlowPilotConfig): FlowPilotApp {
  return new FlowPilotApp(config);
}
