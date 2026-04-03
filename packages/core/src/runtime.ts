import type { CompiledFlow, FlowEvent, NodeResult } from "./types.js";
import type { AdapterRegistry } from "./llm/registry.js";
import type { SystemPromptBuilder } from "./llm/prompts.js";
import { StateManager } from "./state.js";
import { ConversationContextImpl } from "./context.js";
import { RuntimeError } from "./errors.js";

interface RuntimeOptions {
  adapterRegistry?: AdapterRegistry;
  systemPromptBuilder?: SystemPromptBuilder;
}

export async function* runConversation<S extends Record<string, unknown>>(
  compiled: CompiledFlow<S>,
  sessionId: string,
  initialState?: Partial<S>,
  options?: RuntimeOptions,
): AsyncGenerator<FlowEvent> {
  const stateManager = new StateManager(
    compiled.stateSchema,
    compiled.reducers as Partial<Record<keyof S, (current: unknown, update: unknown) => unknown>>,
  );
  let state = stateManager.apply(stateManager.getInitialState(), initialState ?? ({} as Partial<S>));
  let currentNodeName: string | null = compiled.entryNode;
  let turn = 0;

  while (currentNodeName !== null) {
    const nodeDef = compiled.nodes.get(currentNodeName);
    if (!nodeDef) {
      yield {
        type: "error",
        error: new RuntimeError(
          `Node "${currentNodeName}" not found`,
          sessionId,
          currentNodeName,
        ),
        recoverable: false,
      };
      return;
    }

    turn++;
    yield { type: "node:enter", node: currentNodeName, timestamp: Date.now() };

    let result: NodeResult;
    try {
      const ctx = new ConversationContextImpl({
        sessionId,
        state,
        stateManager,
        turn,
        adapterRegistry: options?.adapterRegistry,
        systemPromptBuilder: options?.systemPromptBuilder,
      });
      result = await nodeDef.handler(ctx);
    } catch (err) {
      yield {
        type: "error",
        error: err instanceof Error ? err : new Error(String(err)),
        recoverable: false,
      };
      return;
    }

    // Apply state update if present
    if (result.stateUpdate) {
      state = stateManager.apply(state, result.stateUpdate as Partial<S>);
      yield { type: "state:update", patch: result.stateUpdate };
    }

    // Emit message if present
    if (result.text) {
      yield { type: "message", text: result.text };
    }

    yield { type: "node:exit", node: currentNodeName, result };

    // Resolve next node
    currentNodeName = resolveNextNode(compiled, currentNodeName, result, state as Record<string, unknown>);
  }

  yield {
    type: "flow:complete",
    sessionId,
    finalState: state as Record<string, unknown>,
  };
}

function resolveNextNode<S extends Record<string, unknown>>(
  compiled: CompiledFlow<S>,
  currentNode: string,
  result: NodeResult,
  state: Record<string, unknown>,
): string | null {
  // 1. Explicit goto from node result
  if (result.gotoNode) {
    if (compiled.nodes.has(result.gotoNode)) {
      return result.gotoNode;
    }
  }

  // 2. If result is just a reply (no goto), flow ends
  if (result.type === "reply" || result.type === "end") {
    return null;
  }

  // 3. Resolve via edge map
  const edges = compiled.edgeMap.get(currentNode) ?? [];

  // Try conditional edges first
  for (const edge of edges) {
    if (edge.condition && edge.condition(state)) {
      return edge.to;
    }
  }

  // Fall back to unconditional edge (default)
  const defaultEdge = edges.find((e) => !e.condition);
  if (defaultEdge) {
    return defaultEdge.to;
  }

  // No edge found — flow ends
  return null;
}
