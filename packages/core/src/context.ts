import type { ConversationContext, FlowEvent, NodeResult, Option, SlotDefinition } from "./types.js";
import type { StateManager } from "./state.js";
import type { AdapterRegistry } from "./llm/registry.js";
import type { SystemPromptBuilder } from "./llm/prompts.js";
import type { EventChannel } from "./event-channel.js";

interface ContextInit<S extends Record<string, unknown>> {
  sessionId: string;
  state: S;
  stateManager: StateManager<S>;
  turn: number;
  adapterRegistry?: AdapterRegistry;
  systemPromptBuilder?: SystemPromptBuilder;
  eventChannel?: EventChannel<FlowEvent>;
  promptFn?: (question: string, options?: Option[]) => Promise<string>;
  pendingStateUpdate?: Record<string, unknown>;
}

export class ConversationContextImpl<S extends Record<string, unknown>>
  implements ConversationContext<S>
{
  readonly sessionId: string;
  readonly state: Readonly<S>;
  readonly turn: number;
  private readonly stateManager: StateManager<S>;
  private readonly adapterRegistry?: AdapterRegistry;
  private readonly systemPromptBuilder?: SystemPromptBuilder;
  private readonly eventChannel?: EventChannel<FlowEvent>;
  private readonly promptFn?: (question: string, options?: Option[]) => Promise<string>;
  private readonly pendingStateUpdate: Record<string, unknown>;

  constructor(init: ContextInit<S>) {
    this.sessionId = init.sessionId;
    this.state = init.stateManager.freeze(init.state);
    this.turn = init.turn;
    this.stateManager = init.stateManager;
    this.adapterRegistry = init.adapterRegistry;
    this.systemPromptBuilder = init.systemPromptBuilder;
    this.eventChannel = init.eventChannel;
    this.promptFn = init.promptFn;
    this.pendingStateUpdate = init.pendingStateUpdate ?? {};
  }

  update(partial: Partial<S>): ConversationContext<S> {
    const newState = this.stateManager.apply(
      this.state as S,
      partial,
    );
    // Accumulate pending state updates for inclusion in the next NodeResult
    const mergedPending = { ...this.pendingStateUpdate, ...partial };
    return new ConversationContextImpl({
      sessionId: this.sessionId,
      state: newState,
      stateManager: this.stateManager,
      turn: this.turn,
      adapterRegistry: this.adapterRegistry,
      systemPromptBuilder: this.systemPromptBuilder,
      eventChannel: this.eventChannel,
      promptFn: this.promptFn,
      pendingStateUpdate: mergedPending,
    });
  }

  reply(text: string): NodeResult {
    const stateUpdate = Object.keys(this.pendingStateUpdate).length > 0
      ? this.pendingStateUpdate
      : undefined;
    return { type: "reply", text, stateUpdate };
  }

  goto(nodeName: string): NodeResult {
    const stateUpdate = Object.keys(this.pendingStateUpdate).length > 0
      ? this.pendingStateUpdate
      : undefined;
    return { type: "goto", gotoNode: nodeName, stateUpdate };
  }

  replyAndGoto(text: string, nodeName: string): NodeResult {
    const stateUpdate = Object.keys(this.pendingStateUpdate).length > 0
      ? this.pendingStateUpdate
      : undefined;
    return { type: "reply_goto", text, gotoNode: nodeName, stateUpdate };
  }

  async generate(prompt: string, opts?: { model?: string; systemPrompt?: string }): Promise<string> {
    if (!this.adapterRegistry) throw new Error("No LLM adapter configured");

    const { adapter, model } = opts?.model
      ? this.adapterRegistry.resolveWithModel(opts.model)
      : this.adapterRegistry.resolveDefault();

    const systemPrompt = opts?.systemPrompt
      ?? this.systemPromptBuilder?.build(this.state as Record<string, unknown>)
      ?? undefined;

    const response = await adapter.complete({
      model,
      messages: [{ role: "user", content: prompt }],
      systemPrompt,
    });

    return response.content;
  }

  async classify(intents: string[], opts?: { model?: string }): Promise<{ label: string; confidence: number }> {
    if (!this.adapterRegistry) throw new Error("No LLM adapter configured");

    const { adapter, model } = opts?.model
      ? this.adapterRegistry.resolveWithModel(opts.model)
      : this.adapterRegistry.resolveDefault();

    const intentList = intents.join(", ");
    const prompt = `Classify the user's intent into exactly one of these categories: ${intentList}. Respond with JSON: {"label": "<category>", "confidence": <0-1>}`;

    const systemPrompt = this.systemPromptBuilder?.build(this.state as Record<string, unknown>) ?? undefined;

    const response = await adapter.complete({
      model,
      messages: [{ role: "user", content: prompt }],
      systemPrompt,
    });

    try {
      const parsed = JSON.parse(response.content);
      return { label: parsed.label, confidence: parsed.confidence ?? 0.5 };
    } catch {
      // If LLM doesn't return valid JSON, try to extract intent
      const lowerContent = response.content.toLowerCase();
      for (const intent of intents) {
        if (lowerContent.includes(intent.toLowerCase())) {
          return { label: intent, confidence: 0.5 };
        }
      }
      return { label: intents[0], confidence: 0.1 };
    }
  }

  async prompt(question: string): Promise<string> {
    if (!this.promptFn) {
      throw new Error(
        "prompt() requires a Conversation context. Use conversation.send() instead of app.run()",
      );
    }
    return this.promptFn(question);
  }

  async promptWithOptions(
    question: string,
    options: Option[],
    _opts?: { natural?: boolean },
  ): Promise<string> {
    if (!this.promptFn) {
      throw new Error(
        "promptWithOptions() requires a Conversation context",
      );
    }
    return this.promptFn(question, options);
  }

  async fillSlots(
    schema: Record<string, SlotDefinition>,
  ): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    for (const [slotName, def] of Object.entries(schema)) {
      if (def.skip) {
        result[slotName] = def.defaultValue ?? null;
        continue;
      }
      let attempts = 0;
      const maxAttempts = def.maxAttempts ?? Infinity;
      let currentPrompt = def.prompt;
      while (attempts < maxAttempts) {
        const response = await this.prompt(currentPrompt);
        attempts++;
        if (
          def.optional &&
          def.skipKeyword &&
          response.toLowerCase() === def.skipKeyword.toLowerCase()
        ) {
          result[slotName] = null;
          break;
        }
        if (def.validate) {
          try {
            const validated = def.validate.parse(response);
            result[slotName] = def.transform
              ? def.transform(response)
              : validated;
            break;
          } catch {
            currentPrompt = def.errorMessage ?? `Invalid input. ${def.prompt}`;
            continue;
          }
        } else {
          result[slotName] = def.transform
            ? def.transform(response)
            : response;
          break;
        }
      }
      if (!(slotName in result)) {
        result[slotName] = null;
      }
    }
    return result;
  }
}
