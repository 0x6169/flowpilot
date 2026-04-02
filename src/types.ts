// src/types.ts
import type { z } from "zod";

// ─── Sentinel ─────────────────────────────────────────
export const END = Symbol("END");
export type EndSymbol = typeof END;

// ─── Flow Events (yielded by runtime) ─────────────────
export type FlowEvent =
  | { type: "node:enter"; node: string; timestamp: number }
  | { type: "node:exit"; node: string; result: NodeResult }
  | { type: "llm:token"; text: string }
  | { type: "llm:done"; usage: TokenUsage }
  | { type: "tool:start"; tool: string; input: unknown }
  | { type: "tool:result"; tool: string; output: unknown; duration: number }
  | { type: "tool:error"; tool: string; error: string; retryCount: number }
  | { type: "state:update"; patch: Record<string, unknown> }
  | { type: "message"; text: string }
  | { type: "flow:complete"; sessionId: string; finalState: Record<string, unknown> }
  | { type: "error"; error: Error; recoverable: boolean };

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// ─── Node ─────────────────────────────────────────────
export type NodeHandler<S = Record<string, unknown>> = (
  ctx: ConversationContext<S>,
) => Promise<NodeResult>;

export interface NodeResult {
  type: "reply" | "goto" | "reply_goto" | "end";
  text?: string;
  gotoNode?: string;
  stateUpdate?: Record<string, unknown>;
}

export interface NodeDefinition<S = Record<string, unknown>> {
  name: string;
  handler: NodeHandler<S>;
  config?: NodeConfig;
}

export interface NodeConfig {
  model?: string;
  hooks?: HookDefinition[];
}

// ─── Edge ─────────────────────────────────────────────
export interface EdgeDefinition {
  from: string;
  to: string;
  condition?: EdgeCondition;
}

export type EdgeCondition = (state: Record<string, unknown>) => boolean;

// ─── Hook ─────────────────────────────────────────────
export type HookEvent =
  | "before:node"
  | "after:node"
  | "before:llm"
  | "after:llm"
  | "before:tool"
  | "after:tool"
  | "before:turn"
  | "after:turn";

export interface HookDefinition {
  on: HookEvent;
  handler: (...args: unknown[]) => Promise<HookResult>;
}

export type HookResult =
  | void
  | { modify: Record<string, unknown> }
  | { block: string }
  | { redirect: string };

// ─── Option ───────────────────────────────────────────
export interface Option {
  label: string;
  value: string;
}

// ─── Flow Definition (output of builder) ──────────────
export interface FlowDefinition<S = Record<string, unknown>> {
  name: string;
  stateSchema: z.ZodType<S>;
  nodes: Map<string, NodeDefinition<S>>;
  edges: EdgeDefinition[];
  reducers?: Partial<Record<keyof S, (current: unknown, update: unknown) => unknown>>;
  config?: FlowConfig;
}

export interface FlowConfig {
  conversation?: { style: "natural" | "structured" };
  systemPrompt?: string | ((ctx: ConversationContext) => string);
}

// ─── Compiled Flow (output of compiler) ───────────────
export interface CompiledFlow<S = Record<string, unknown>> {
  name: string;
  stateSchema: z.ZodType<S>;
  nodes: Map<string, NodeDefinition<S>>;
  edgeMap: Map<string, EdgeDefinition[]>;
  entryNode: string;
  reducers: Record<string, (current: unknown, update: unknown) => unknown>;
}

// ─── Session ──────────────────────────────────────────
export interface Session<S = Record<string, unknown>> {
  id: string;
  flowName: string;
  state: S;
  currentNode: string;
  messages: ConversationMessage[];
  turn: number;
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

// ─── ConversationContext (interface only — implemented in context.ts)
export interface ConversationContext<S = Record<string, unknown>> {
  state: Readonly<S>;
  update(partial: Partial<S>): ConversationContext<S>;
  reply(text: string): NodeResult;
  goto(nodeName: string): NodeResult;
  sessionId: string;
  turn: number;
}
