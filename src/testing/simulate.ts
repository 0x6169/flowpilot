import { compile } from "../compiler.js";
import { Conversation } from "../conversation.js";
import { FlowBuilder } from "../flow.js";
import type { FlowEvent } from "../types.js";
import type { SimulationResult } from "./types.js";

export interface SimulationOptions {
  mockedTools?: Record<string, (...args: unknown[]) => Promise<unknown>>;
}

type Assertion =
  | { kind: "botReplied"; pattern: RegExp }
  | { kind: "nodeReached"; nodeName: string }
  | { kind: "state"; expected: Record<string, unknown> };

export class SimulationBuilder {
  private readonly builder: FlowBuilder<Record<string, unknown>>;
  private readonly options: SimulationOptions;
  private readonly userMessages: string[] = [];
  private readonly assertions: Assertion[] = [];

  constructor(
    builder: FlowBuilder<Record<string, unknown>>,
    options: SimulationOptions = {},
  ) {
    this.builder = builder;
    this.options = options;
  }

  user(text: string): this {
    this.userMessages.push(text);
    return this;
  }

  assertBotReplied(pattern: RegExp): this {
    this.assertions.push({ kind: "botReplied", pattern });
    return this;
  }

  assertNodeReached(nodeName: string): this {
    this.assertions.push({ kind: "nodeReached", nodeName });
    return this;
  }

  assertState(expected: Record<string, unknown>): this {
    this.assertions.push({ kind: "state", expected });
    return this;
  }

  async run(): Promise<SimulationResult> {
    const compiled = compile(this.builder.build());
    const sessionId = `sim-${Date.now()}`;
    const conv = new Conversation({ compiled, sessionId });

    const allEvents: FlowEvent[] = [];
    let turns = 0;
    let finalState: Record<string, unknown> = {};

    for (const message of this.userMessages) {
      turns++;
      for await (const event of conv.send(message)) {
        allEvents.push(event);
        if (event.type === "flow:complete") {
          finalState = event.finalState;
        }
      }
    }

    // Gather final state from flow:complete event if not set yet
    const completeEvent = allEvents.find((e) => e.type === "flow:complete") as
      | { type: "flow:complete"; sessionId: string; finalState: Record<string, unknown> }
      | undefined;
    if (completeEvent) {
      finalState = completeEvent.finalState;
    }

    const errors: string[] = [];

    for (const assertion of this.assertions) {
      if (assertion.kind === "botReplied") {
        const botMessages = allEvents
          .filter((e) => e.type === "message")
          .map((e) => (e as { type: "message"; text: string }).text);
        const matched = botMessages.some((text) => assertion.pattern.test(text));
        if (!matched) {
          errors.push(
            `assertBotReplied: no message matched pattern ${assertion.pattern}. ` +
              `Messages received: ${JSON.stringify(botMessages)}`,
          );
        }
      } else if (assertion.kind === "nodeReached") {
        const nodeEntered = allEvents.some(
          (e) => e.type === "node:enter" && (e as { type: "node:enter"; node: string }).node === assertion.nodeName,
        );
        if (!nodeEntered) {
          errors.push(
            `assertNodeReached: node "${assertion.nodeName}" was never entered`,
          );
        }
      } else if (assertion.kind === "state") {
        for (const [key, value] of Object.entries(assertion.expected)) {
          if (finalState[key] !== value) {
            errors.push(
              `assertState: expected state["${key}"] === ${JSON.stringify(value)}, ` +
                `got ${JSON.stringify(finalState[key])}`,
            );
          }
        }
      }
    }

    const completedSuccessfully =
      errors.length === 0 &&
      allEvents.some((e) => e.type === "flow:complete");

    return {
      completedSuccessfully,
      turns,
      events: allEvents,
      finalState,
      errors,
    };
  }
}

export function simulate(
  flowBuilder: FlowBuilder<Record<string, unknown>>,
  options?: SimulationOptions,
): SimulationBuilder {
  return new SimulationBuilder(flowBuilder, options);
}
