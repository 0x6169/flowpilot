import type { z } from "zod";
import type {
  FlowDefinition,
  FlowConfig,
  NodeDefinition,
  NodeHandler,
  NodeConfig,
  EdgeDefinition,
  EdgeCondition,
  NodeResult,
} from "./types.js";

interface FlowOptions<S> {
  state: z.ZodType<S>;
  reducers?: Partial<Record<keyof S, (current: unknown, update: unknown) => unknown>>;
  conversation?: FlowConfig["conversation"];
  systemPrompt?: FlowConfig["systemPrompt"];
}

export class FlowBuilder<S extends Record<string, unknown>> {
  private readonly name: string;
  private readonly stateSchema: z.ZodType<S>;
  private readonly nodes = new Map<string, NodeDefinition<S>>();
  private readonly edges: EdgeDefinition[] = [];
  private readonly reducers?: FlowOptions<S>["reducers"];
  private readonly config?: FlowConfig;

  constructor(name: string, options: FlowOptions<S>) {
    this.name = name;
    this.stateSchema = options.state;
    this.reducers = options.reducers;
    if (options.conversation || options.systemPrompt) {
      this.config = {
        conversation: options.conversation,
        systemPrompt: options.systemPrompt,
      };
    }
  }

  node(name: string, handler: NodeHandler<S>, config?: NodeConfig): this {
    if (this.nodes.has(name)) {
      throw new Error(`Duplicate node name: "${name}"`);
    }
    this.nodes.set(name, { name, handler, config });
    return this;
  }

  edge(from: string, to: string, condition?: EdgeCondition): this {
    this.edges.push({ from, to, condition });
    return this;
  }

  build(): FlowDefinition<S> {
    return {
      name: this.name,
      stateSchema: this.stateSchema,
      nodes: new Map(this.nodes),
      edges: [...this.edges],
      reducers: this.reducers as FlowDefinition<S>["reducers"],
      config: this.config,
    };
  }
}

export function flow<S extends Record<string, unknown>>(
  name: string,
  options: FlowOptions<S>,
): FlowBuilder<S> {
  return new FlowBuilder(name, options);
}

export function when(
  valueOrFn: string | ((state: Record<string, unknown>) => boolean),
): EdgeCondition {
  if (typeof valueOrFn === "function") {
    return valueOrFn;
  }
  return (state: Record<string, unknown>) => {
    return Object.values(state).some((v) => v === valueOrFn);
  };
}
