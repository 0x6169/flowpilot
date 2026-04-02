import { describe, it, expect } from "vitest";
import { ConversationContextImpl } from "../src/context.js";
import { StateManager } from "../src/state.js";
import { z } from "zod";

const schema = z.object({
  name: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

function createCtx(initialState?: Partial<z.infer<typeof schema>>) {
  const sm = new StateManager(schema);
  const state = sm.apply(sm.getInitialState(), initialState ?? {});
  return new ConversationContextImpl({
    sessionId: "test-session",
    state,
    stateManager: sm,
    turn: 1,
  });
}

describe("ConversationContext", () => {
  it("exposes readonly state", () => {
    const ctx = createCtx({ name: "Alice" });
    expect(ctx.state.name).toBe("Alice");
    expect(() => {
      (ctx.state as any).name = "Bob";
    }).toThrow();
  });

  it("ctx.reply() returns reply NodeResult", () => {
    const ctx = createCtx();
    const result = ctx.reply("Hello!");
    expect(result).toEqual({ type: "reply", text: "Hello!" });
  });

  it("ctx.goto() returns goto NodeResult", () => {
    const ctx = createCtx();
    const result = ctx.goto("next_node");
    expect(result).toEqual({ type: "goto", gotoNode: "next_node" });
  });

  it("ctx.replyAndGoto() returns reply_goto NodeResult", () => {
    const ctx = createCtx();
    const result = ctx.replyAndGoto("Hello!", "next_node");
    expect(result).toEqual({
      type: "reply_goto",
      text: "Hello!",
      gotoNode: "next_node",
    });
  });

  it("ctx.update() returns new context with updated state", () => {
    const ctx = createCtx();
    const ctx2 = ctx.update({ name: "Bob" });
    expect(ctx2.state.name).toBe("Bob");
    expect(ctx.state.name).toBeUndefined();
  });

  it("ctx.update() accumulates — arrays append", () => {
    const ctx = createCtx();
    const ctx2 = ctx.update({ tags: ["a"] });
    const ctx3 = ctx2.update({ tags: ["b"] });
    expect(ctx3.state.tags).toEqual(["a", "b"]);
  });

  it("exposes sessionId and turn", () => {
    const ctx = createCtx();
    expect(ctx.sessionId).toBe("test-session");
    expect(ctx.turn).toBe(1);
  });
});
