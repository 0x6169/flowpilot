import type {
  CompiledFlow,
  FlowEvent,
  NodeResult,
  Option,
} from "./types.js";
import type { AdapterRegistry } from "./llm/registry.js";
import type { SystemPromptBuilder } from "./llm/prompts.js";
import type { ConversationStore, SessionSnapshot } from "./store/types.js";
import { StateManager } from "./state.js";
import { ConversationContextImpl } from "./context.js";
import { EventChannel } from "./event-channel.js";
import { RuntimeError } from "./errors.js";

export interface ConversationConfig {
  compiled: CompiledFlow<any>;
  sessionId: string;
  store?: ConversationStore;
  adapterRegistry?: AdapterRegistry;
  systemPromptBuilder?: SystemPromptBuilder;
  initialState?: Record<string, unknown>;
}

export type ConversationStatus =
  | "idle"
  | "running"
  | "waiting_for_input"
  | "completed"
  | "error";

export class Conversation {
  private readonly compiled: CompiledFlow<any>;
  private readonly sessionId: string;
  private readonly store?: ConversationStore;
  private readonly adapterRegistry?: AdapterRegistry;
  private readonly systemPromptBuilder?: SystemPromptBuilder;
  private readonly stateManager: StateManager<any>;
  private readonly eventChannel: EventChannel<FlowEvent>;

  private state: Record<string, unknown>;
  private currentNodeName: string | null;
  private turn: number;
  private _status: ConversationStatus = "idle";

  // Suspend/resume machinery
  private promptResolver: ((response: string) => void) | null = null;
  private handlerPromise: Promise<NodeResult> | null = null;
  private pendingPromptQuestion: string | null = null;
  private pendingPromptOptions: Option[] | undefined = undefined;

  constructor(config: ConversationConfig) {
    this.compiled = config.compiled;
    this.sessionId = config.sessionId;
    this.store = config.store;
    this.adapterRegistry = config.adapterRegistry;
    this.systemPromptBuilder = config.systemPromptBuilder;

    this.stateManager = new StateManager(
      config.compiled.stateSchema,
      config.compiled.reducers as any,
    );
    this.state = this.stateManager.apply(
      this.stateManager.getInitialState(),
      config.initialState ?? {},
    );
    this.currentNodeName = config.compiled.entryNode;
    this.turn = 0;
    this.eventChannel = new EventChannel<FlowEvent>();
  }

  get status(): ConversationStatus {
    return this._status;
  }

  async *send(userMessage: string): AsyncGenerator<FlowEvent> {
    // --- Case 1: Resuming from a prompt ---
    if (this._status === "waiting_for_input" && this.promptResolver) {
      this._status = "running";
      const resolver = this.promptResolver;
      this.promptResolver = null;

      yield {
        type: "prompt:reply",
        response: userMessage,
        responseTime: 0,
      };

      // Resume the handler by resolving the pending promise
      resolver(userMessage);

      // The handler is now resumed. Continue the run loop with the
      // existing handlerPromise (the handler may complete or hit
      // another prompt).
      yield* this.continueExecution();
      return;
    }

    // --- Case 2: Starting fresh ---
    if (this._status !== "idle") {
      // If completed or error, reset for a new run is not supported yet
      // Just return
      return;
    }

    this._status = "running";
    yield* this.runFromCurrentNode();
  }

  /**
   * Run the node loop starting from this.currentNodeName.
   */
  private async *runFromCurrentNode(): AsyncGenerator<FlowEvent> {
    while (this.currentNodeName !== null) {
      const nodeDef = this.compiled.nodes.get(this.currentNodeName);
      if (!nodeDef) {
        this._status = "error";
        yield {
          type: "error",
          error: new RuntimeError(
            `Node "${this.currentNodeName}" not found`,
            this.sessionId,
            this.currentNodeName,
          ),
          recoverable: false,
        };
        return;
      }

      this.turn++;
      yield { type: "node:enter", node: this.currentNodeName, timestamp: Date.now() };

      // Set up prompt detection
      let promptCalled = false;
      let promptResolveSignal: (() => void) | null = null;
      const promptDetectedPromise = new Promise<void>((resolve) => {
        promptResolveSignal = resolve;
      });

      const promptFn = (question: string, options?: Option[]): Promise<string> => {
        promptCalled = true;
        this.pendingPromptQuestion = question;
        this.pendingPromptOptions = options;

        // Push the prompt:send event to the channel
        this.eventChannel.push({
          type: "prompt:send",
          question,
          style: options ? "structured" : "natural",
          options,
        });

        // Create a promise that will be resolved when the user responds
        return new Promise<string>((resolve) => {
          this.promptResolver = resolve;
          // Signal that a prompt was called
          promptResolveSignal!();
        });
      };

      const ctx = new ConversationContextImpl({
        sessionId: this.sessionId,
        state: this.state,
        stateManager: this.stateManager,
        turn: this.turn,
        adapterRegistry: this.adapterRegistry,
        systemPromptBuilder: this.systemPromptBuilder,
        eventChannel: this.eventChannel,
        promptFn,
      });

      // Start the handler
      let result: NodeResult;
      try {
        const handlerPromise = nodeDef.handler(ctx);

        // Race: handler completes OR prompt is called
        const winner = await Promise.race([
          handlerPromise.then((r) => ({ type: "done" as const, result: r })),
          promptDetectedPromise.then(() => ({ type: "prompt" as const })),
        ]);

        if (winner.type === "prompt") {
          // Handler is suspended at a prompt. Store the handler promise
          // so we can continue when resumed.
          this.handlerPromise = handlerPromise;
          this._status = "waiting_for_input";

          // Yield any events from the channel (the prompt:send event)
          for (const event of this.eventChannel.drain()) {
            yield event;
          }

          // Persist to store if available
          await this.saveSnapshot();

          return;
        }

        // Handler completed normally
        result = winner.result;
        this.handlerPromise = null;
      } catch (err) {
        this._status = "error";
        yield {
          type: "error",
          error: err instanceof Error ? err : new Error(String(err)),
          recoverable: false,
        };
        return;
      }

      // Process the result
      yield* this.processResult(result);

      // Resolve next node
      this.currentNodeName = this.resolveNextNode(this.currentNodeName, result);
    }

    // Flow completed
    this._status = "completed";
    yield {
      type: "flow:complete",
      sessionId: this.sessionId,
      finalState: { ...this.state },
    };

    await this.saveSnapshot();
  }

  /**
   * Continue execution after resuming from a prompt.
   * The handler is running again (its Promise was resolved).
   * It may complete or hit another prompt.
   */
  private async *continueExecution(): AsyncGenerator<FlowEvent> {
    if (!this.handlerPromise) return;

    // Set up prompt detection for the next potential prompt
    let promptResolveSignal: (() => void) | null = null;
    const promptDetectedPromise = new Promise<void>((resolve) => {
      promptResolveSignal = resolve;
    });

    // We need to intercept the next prompt call. But the handler already
    // has a reference to the old promptFn closure. The trick: our promptFn
    // closure sets this.promptResolver, and the continueExecution picks
    // that up. But we also need a signal.
    //
    // Actually, the handler's promptFn is the closure we created in
    // runFromCurrentNode. When it calls promptFn again, it will:
    // 1. Set this.promptResolver
    // 2. Push to eventChannel
    // 3. Signal via promptResolveSignal (but that's from the OLD closure!)
    //
    // We need a different approach: watch for promptResolver being set.
    // We'll poll using Promise.race with a micro-task sentinel.

    // Create a "check for prompt" mechanism by watching the event channel
    const handlerPromise = this.handlerPromise;

    // We need to detect if the handler calls promptFn again.
    // The handler still has the same promptFn closure, which will:
    //   - set this.promptResolver
    //   - push to this.eventChannel
    // So we can detect by watching eventChannel.
    const promptWatcher = new Promise<void>((resolve) => {
      // Override: when ANY event is pushed to the channel, it means
      // a prompt was sent. We use a polling approach via the channel.
      const checkPrompt = (): void => {
        if (this.eventChannel.hasPending() || this.promptResolver) {
          resolve();
        } else {
          // Use setTimeout to yield to the event loop
          setTimeout(checkPrompt, 0);
        }
      };
      // Start checking on next tick
      setTimeout(checkPrompt, 0);
    });

    try {
      const winner = await Promise.race([
        handlerPromise.then((r) => ({ type: "done" as const, result: r })),
        promptWatcher.then(() => ({ type: "prompt" as const })),
      ]);

      if (winner.type === "prompt") {
        // Another prompt was hit
        this._status = "waiting_for_input";
        this.handlerPromise = handlerPromise;

        for (const event of this.eventChannel.drain()) {
          yield event;
        }

        await this.saveSnapshot();
        return;
      }

      // Handler completed
      const result = winner.result;
      this.handlerPromise = null;

      // Drain any remaining events from the channel
      for (const event of this.eventChannel.drain()) {
        yield event;
      }

      // Process the result and capture the current node before advancing
      const completedNode = this.currentNodeName!;
      yield* this.processResult(result);

      // Resolve next node
      this.currentNodeName = this.resolveNextNode(completedNode, result);

      // Continue running subsequent nodes
      if (this.currentNodeName !== null) {
        yield* this.runFromCurrentNode();
      } else {
        this._status = "completed";
        yield {
          type: "flow:complete",
          sessionId: this.sessionId,
          finalState: { ...this.state },
        };
        await this.saveSnapshot();
      }
    } catch (err) {
      this._status = "error";
      yield {
        type: "error",
        error: err instanceof Error ? err : new Error(String(err)),
        recoverable: false,
      };
    }
  }

  /**
   * Process a node result: apply state updates, emit messages.
   */
  private *processResult(result: NodeResult): Generator<FlowEvent> {
    if (result.stateUpdate) {
      this.state = this.stateManager.apply(this.state, result.stateUpdate);
      yield { type: "state:update", patch: result.stateUpdate };
    }

    if (result.text) {
      yield { type: "message", text: result.text };
    }

    yield {
      type: "node:exit",
      node: this.currentNodeName!,
      result,
    };
  }

  /**
   * Resolve the next node based on result and edges.
   */
  private resolveNextNode(
    currentNode: string,
    result: NodeResult,
  ): string | null {
    // 1. Explicit goto
    if (result.gotoNode) {
      if (this.compiled.nodes.has(result.gotoNode)) {
        return result.gotoNode;
      }
    }

    // 2. Reply or end => flow ends
    if (result.type === "reply" || result.type === "end") {
      return null;
    }

    // 3. Edge map
    const edges = this.compiled.edgeMap.get(currentNode) ?? [];

    for (const edge of edges) {
      if (edge.condition && edge.condition(this.state)) {
        return edge.to;
      }
    }

    const defaultEdge = edges.find((e) => !e.condition);
    if (defaultEdge) {
      return defaultEdge.to;
    }

    return null;
  }

  /**
   * Save session snapshot to the store.
   */
  private async saveSnapshot(): Promise<void> {
    if (!this.store) return;

    const snapshot: SessionSnapshot = {
      sessionId: this.sessionId,
      flowName: this.compiled.name,
      currentNode: this.currentNodeName ?? "",
      state: { ...this.state },
      messages: [],
      pendingPrompt:
        this._status === "waiting_for_input" && this.pendingPromptQuestion
          ? {
              question: this.pendingPromptQuestion,
              nodeName: this.currentNodeName ?? "",
              style: this.pendingPromptOptions ? "structured" : "natural",
              options: this.pendingPromptOptions,
            }
          : null,
      turn: this.turn,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.store.save(snapshot);
  }
}
