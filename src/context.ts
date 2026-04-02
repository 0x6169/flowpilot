import type { ConversationContext, NodeResult } from "./types.js";
import type { StateManager } from "./state.js";

interface ContextInit<S extends Record<string, unknown>> {
  sessionId: string;
  state: S;
  stateManager: StateManager<S>;
  turn: number;
}

export class ConversationContextImpl<S extends Record<string, unknown>>
  implements ConversationContext<S>
{
  readonly sessionId: string;
  readonly state: Readonly<S>;
  readonly turn: number;
  private readonly stateManager: StateManager<S>;

  constructor(init: ContextInit<S>) {
    this.sessionId = init.sessionId;
    this.state = init.stateManager.freeze(init.state);
    this.turn = init.turn;
    this.stateManager = init.stateManager;
  }

  update(partial: Partial<S>): ConversationContext<S> {
    const newState = this.stateManager.apply(
      this.state as S,
      partial,
    );
    return new ConversationContextImpl({
      sessionId: this.sessionId,
      state: newState,
      stateManager: this.stateManager,
      turn: this.turn,
    });
  }

  reply(text: string): NodeResult {
    return { type: "reply", text };
  }

  goto(nodeName: string): NodeResult {
    return { type: "goto", gotoNode: nodeName };
  }

  replyAndGoto(text: string, nodeName: string): NodeResult {
    return { type: "reply_goto", text, gotoNode: nodeName };
  }
}
