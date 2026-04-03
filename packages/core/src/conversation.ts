import type {
  CompiledFlow,
  FlowEvent,
  HookDefinition,
  NodeResult,
  Option,
} from "./types.js";
import type { AdapterRegistry } from "./llm/registry.js";
import type { SystemPromptBuilder } from "./llm/prompts.js";
import type { ConversationStore, SessionSnapshot } from "./store/types.js";
import type { TokenManagerOptions } from "./tokens/manager.js";
import { StateManager } from "./state.js";
import { ConversationContextImpl, type CompletedBackgroundTask } from "./context.js";
import { EventChannel } from "./event-channel.js";
import { RuntimeError } from "./errors.js";
import { Scheduler } from "./scheduler.js";
import { TokenManager } from "./tokens/manager.js";
import { ContextCompactor } from "./tokens/compactor.js";
import { HookRunner } from "./hooks/runner.js";

export interface ContextCompactionConfig {
  model: string;
  preserveRecent?: number;
  preserveSlots?: boolean;
}

export interface ConversationConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- type erasure: works with any flow state schema
  compiled: CompiledFlow<any>;
  sessionId: string;
  store?: ConversationStore;
  adapterRegistry?: AdapterRegistry;
  systemPromptBuilder?: SystemPromptBuilder;
  initialState?: Record<string, unknown>;
  tokenManager?: TokenManagerOptions;
  compaction?: ContextCompactionConfig;
  hooks?: HookDefinition[];
}

export type ConversationStatus =
  | "idle"
  | "running"
  | "waiting_for_input"
  | "completed"
  | "error";

export class Conversation {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- type erasure: works with any flow state schema
  private readonly compiled: CompiledFlow<any>;
  private readonly sessionId: string;
  private readonly store?: ConversationStore;
  private readonly adapterRegistry?: AdapterRegistry;
  private readonly systemPromptBuilder?: SystemPromptBuilder;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- type erasure: works with any flow state schema
  private readonly stateManager: StateManager<any>;
  private readonly eventChannel: EventChannel<FlowEvent>;
  private readonly tokenManager?: TokenManager;
  private readonly compactor?: ContextCompactor;
  private readonly hookRunner: HookRunner;

  private state: Record<string, unknown>;
  private currentNodeName: string | null;
  private turn: number;
  private _status: ConversationStatus = "idle";
  private readonly scheduler: Scheduler;

  // Suspend/resume machinery
  private promptResolver: ((response: string) => void) | null = null;
  private handlerPromise: Promise<NodeResult> | null = null;
  private pendingPromptQuestion: string | null = null;
  private pendingPromptOptions: Option[] | undefined = undefined;

  // Background task queue
  private completedBackgroundTasks: CompletedBackgroundTask[] = [];

  constructor(config: ConversationConfig) {
    this.compiled = config.compiled;
    this.sessionId = config.sessionId;
    this.store = config.store;
    this.adapterRegistry = config.adapterRegistry;
    this.systemPromptBuilder = config.systemPromptBuilder;

    this.stateManager = new StateManager(
      config.compiled.stateSchema,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- type erasure at generic boundary
      config.compiled.reducers as any,
    );
    this.state = this.stateManager.apply(
      this.stateManager.getInitialState(),
      config.initialState ?? {},
    );
    this.currentNodeName = config.compiled.entryNode;
    this.turn = 0;
    this.eventChannel = new EventChannel<FlowEvent>();
    this.scheduler = new Scheduler();

    if (config.tokenManager) {
      this.tokenManager = new TokenManager(config.tokenManager);
    }

    if (config.compaction && config.adapterRegistry) {
      this.compactor = new ContextCompactor({
        registry: config.adapterRegistry,
        model: config.compaction.model,
        preserveRecent: config.compaction.preserveRecent ?? 10,
        preserveSlots: config.compaction.preserveSlots,
      });
    }

    this.hookRunner = new HookRunner(config.hooks ?? []);
  }

  get status(): ConversationStatus {
    return this._status;
  }

  getTokenStats(): ReturnType<TokenManager["getStats"]> | null {
    return this.tokenManager?.getStats() ?? null;
  }

  async *send(userMessage: string): AsyncGenerator<FlowEvent> {
    // --- before:turn hook ---
    const turnHookResult = await this.hookRunner.run("before:turn", { sessionId: this.sessionId, userMessage, turn: this.turn });
    if (turnHookResult && "block" in turnHookResult) {
      yield {
        type: "error",
        error: new RuntimeError(
          `Turn blocked: ${turnHookResult.block}`,
          this.sessionId,
          this.currentNodeName ?? "",
        ),
        recoverable: true,
      };
      return;
    }

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

      // --- before:node hook ---
      const beforeNodeResult = await this.hookRunner.run("before:node", { node: this.currentNodeName, sessionId: this.sessionId, state: this.state });
      if (beforeNodeResult && "block" in beforeNodeResult) {
        // Skip this node; resolve next node with a no-op result and continue
        this.currentNodeName = this.resolveNextNode(this.currentNodeName, { type: "goto" });
        continue;
      }
      if (beforeNodeResult && "redirect" in beforeNodeResult) {
        this.currentNodeName = beforeNodeResult.redirect;
        continue;
      }

      // Set up prompt detection
      let promptResolveSignal: (() => void) | null = null;
      const promptDetectedPromise = new Promise<void>((resolve) => {
        promptResolveSignal = resolve;
      });

      const promptFn = (question: string, options?: Option[]): Promise<string> => {
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
        scheduler: this.scheduler,
        onBackgroundComplete: (task) => {
          this.completedBackgroundTasks.push(task);
        },
      });

      // Check budget before sending to LLM
      if (this.tokenManager?.isBudgetExceeded() || this.tokenManager?.isCostExceeded()) {
        this._status = "completed";
        yield { type: "message", text: "[Token budget exceeded — conversation ended]" };
        yield {
          type: "flow:complete",
          sessionId: this.sessionId,
          finalState: { ...this.state },
        };
        await this.saveSnapshot();
        return;
      }

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

        // --- after:node hook ---
        await this.hookRunner.run("after:node", { node: this.currentNodeName, sessionId: this.sessionId, result, state: this.state });
      } catch (err) {
        this._status = "error";
        yield {
          type: "error",
          error: err instanceof Error ? err : new Error(String(err)),
          recoverable: false,
        };
        return;
      }

      // Update token counts from LLM events emitted during node execution
      this.updateTokensFromChannel();

      // Drain any events pushed to the channel during handler execution
      for (const event of this.eventChannel.drain()) {
        yield event;
      }

      // Run context compaction if threshold reached
      await this.runCompactionIfNeeded();

      // Process the result
      yield* this.processResult(result);

      // Drain any completed background tasks and apply their redirects
      const bgRedirect = yield* this.drainBackgroundTasks();

      // Resolve next node (background redirect takes precedence over normal edge resolution)
      const nextFromResult = this.resolveNextNode(this.currentNodeName, result);
      this.currentNodeName = bgRedirect ?? nextFromResult;
    }

    // Flow completed
    this._status = "completed";
    this.scheduler.cancelAll();
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

      // Update token counts from LLM events emitted during node execution
      this.updateTokensFromChannel();

      // Run context compaction if threshold reached
      await this.runCompactionIfNeeded();

      // Drain any remaining events from the channel
      for (const event of this.eventChannel.drain()) {
        yield event;
      }

      // Process the result and capture the current node before advancing
      const completedNode = this.currentNodeName!;
      yield* this.processResult(result);

      // Drain any completed background tasks and apply their redirects
      const bgRedirect = yield* this.drainBackgroundTasks();

      // Resolve next node (background redirect takes precedence)
      this.currentNodeName = bgRedirect ?? this.resolveNextNode(completedNode, result);

      // Continue running subsequent nodes
      if (this.currentNodeName !== null) {
        yield* this.runFromCurrentNode();
      } else {
        this._status = "completed";
        this.scheduler.cancelAll();
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
   * Drain completed background tasks and apply their onComplete/onError redirects.
   * Returns the goto node from the last task that specifies one, or null.
   */
  private *drainBackgroundTasks(): Generator<FlowEvent, string | null> {
    let redirectTo: string | null = null;

    while (this.completedBackgroundTasks.length > 0) {
      const task = this.completedBackgroundTasks.shift()!;

      let directive: { update?: Record<string, unknown>; goto?: string } | undefined;
      if (task.error) {
        directive = task.config.onError?.(task.error);
      } else {
        directive = task.config.onComplete?.(task.result);
      }

      if (directive?.update) {
        this.state = this.stateManager.apply(this.state, directive.update);
        yield { type: "state:update", patch: directive.update };
      }

      if (directive?.goto) {
        redirectTo = directive.goto;
      }
    }

    return redirectTo;
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
   * Drain llm:done events from the channel and update the TokenManager.
   * Other events remain for the caller to yield.
   */
  private updateTokensFromChannel(): void {
    if (!this.tokenManager) return;
    const pending = this.eventChannel.drain();
    let totalFromThisDrain = 0;
    for (const event of pending) {
      if (event.type === "llm:done") {
        this.tokenManager.addTokens(event.usage.totalTokens);
        totalFromThisDrain += event.usage.totalTokens;
        // Re-push the event so it is still yielded to consumers
        this.eventChannel.push(event);
      } else {
        this.eventChannel.push(event);
      }
    }
    if (totalFromThisDrain > 0) {
      this.tokenManager.setCurrentTokens(
        this.tokenManager.getStats().totalTokens,
      );
    }
  }

  /**
   * Check compaction thresholds and run ContextCompactor if needed.
   * No-op when compactor is not configured.
   */
  private async runCompactionIfNeeded(): Promise<void> {
    if (!this.tokenManager || !this.compactor) return;
    if (!this.tokenManager.canAttemptCompaction()) return;
    if (!this.tokenManager.shouldMicroCompact() && !this.tokenManager.shouldFullCompact()) return;

    try {
      // Collect current conversation messages from state if available.
      // The compactor operates on ConversationMessage[]; we read from state.messages
      // when the flow state schema exposes a messages array.
      const rawMessages = Array.isArray((this.state as Record<string, unknown>).messages)
        ? (this.state as Record<string, unknown>).messages as Array<{ role: string; content: string }>
        : [];

      if (rawMessages.length === 0) return;

      const messages = rawMessages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      }));

      const compactionResult = await this.compactor.compact(messages);

      if (compactionResult.compacted) {
        this.tokenManager.recordCompactionSuccess();
        this.tokenManager.setCurrentTokens(compactionResult.tokensAfter);
        // Update state.messages with the compacted messages
        this.state = this.stateManager.apply(this.state, {
          messages: compactionResult.messages,
        });
      }
    } catch {
      this.tokenManager.recordCompactionFailure();
    }
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
