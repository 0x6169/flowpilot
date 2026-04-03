import { describe, it, expect } from "vitest";
import { ConversationContextImpl } from "../src/context.js";
import { StateManager } from "../src/state.js";
import { AdapterRegistry } from "../src/llm/registry.js";
import { MockLLMAdapter } from "../src/llm/mock.js";
import { SystemPromptBuilder } from "../src/llm/prompts.js";
import { z } from "zod";

const schema = z.object({ name: z.string().optional() });

function createCtxWithLLM() {
  const sm = new StateManager(schema);
  const state = sm.getInitialState();
  const registry = new AdapterRegistry();
  registry.register(new MockLLMAdapter({
    responses: {
      default: "Generated response",
      classify: '{"label": "compra", "confidence": 0.95}',
    },
  }));
  registry.setDefault("mock:default");

  return new ConversationContextImpl({
    sessionId: "test",
    state,
    stateManager: sm,
    turn: 1,
    adapterRegistry: registry,
    systemPromptBuilder: new SystemPromptBuilder({ global: "You are helpful." }),
  });
}

describe("ConversationContext LLM methods", () => {
  it("ctx.generate() returns LLM response text", async () => {
    const ctx = createCtxWithLLM();
    const result = await ctx.generate("Tell me a joke");
    expect(result).toBe("Generated response");
  });

  it("ctx.generate() accepts model override", async () => {
    const ctx = createCtxWithLLM();
    const result = await ctx.generate("Hello", { model: "mock:custom" });
    expect(result).toBe("Generated response");
  });

  it("ctx.classify() returns classification result", async () => {
    const ctx = createCtxWithLLM();
    const result = await ctx.classify(["compra", "suporte"]);
    expect(result.label).toBeDefined();
    expect(result.confidence).toBeDefined();
  });

  it("ctx.generate() throws without adapter", async () => {
    const sm = new StateManager(schema);
    const ctx = new ConversationContextImpl({
      sessionId: "test",
      state: sm.getInitialState(),
      stateManager: sm,
      turn: 1,
    });
    await expect(ctx.generate("hi")).rejects.toThrow(/no llm/i);
  });

  it("ctx.classify() throws without adapter", async () => {
    const sm = new StateManager(schema);
    const ctx = new ConversationContextImpl({
      sessionId: "test",
      state: sm.getInitialState(),
      stateManager: sm,
      turn: 1,
    });
    await expect(ctx.classify(["a", "b"])).rejects.toThrow(/no llm/i);
  });

  it("ctx.generate() uses custom systemPrompt when provided", async () => {
    const ctx = createCtxWithLLM();
    const result = await ctx.generate("Hello", { systemPrompt: "Be concise." });
    expect(result).toBe("Generated response");
  });

  it("ctx.classify() falls back to first intent on non-JSON response", async () => {
    const sm = new StateManager(schema);
    const state = sm.getInitialState();
    const registry = new AdapterRegistry();
    registry.register(new MockLLMAdapter({
      responses: {
        default: "I think it is about suporte",
      },
    }));
    registry.setDefault("mock:default");

    const ctx = new ConversationContextImpl({
      sessionId: "test",
      state,
      stateManager: sm,
      turn: 1,
      adapterRegistry: registry,
    });

    const result = await ctx.classify(["compra", "suporte"]);
    expect(result.label).toBe("suporte");
    expect(result.confidence).toBe(0.5);
  });

  it("ctx.classify() returns first intent with low confidence when no match", async () => {
    const sm = new StateManager(schema);
    const state = sm.getInitialState();
    const registry = new AdapterRegistry();
    registry.register(new MockLLMAdapter({
      responses: {
        default: "something completely unrelated",
      },
    }));
    registry.setDefault("mock:default");

    const ctx = new ConversationContextImpl({
      sessionId: "test",
      state,
      stateManager: sm,
      turn: 1,
      adapterRegistry: registry,
    });

    const result = await ctx.classify(["compra", "suporte"]);
    expect(result.label).toBe("compra");
    expect(result.confidence).toBe(0.1);
  });

  it("update() preserves LLM config in new context", async () => {
    const ctx = createCtxWithLLM();
    const ctx2 = ctx.update({ name: "Alice" });
    // ctx2 should still have LLM capabilities
    const result = await (ctx2 as ConversationContextImpl<any>).generate("Hello");
    expect(result).toBe("Generated response");
  });
});
