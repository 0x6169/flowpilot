import { describe, it, expect } from "vitest";
import { FallbackChain } from "../../src/llm/fallback.js";
import { AdapterRegistry } from "../../src/llm/registry.js";
import { MockLLMAdapter } from "../../src/llm/mock.js";
import type { LLMAdapter } from "../../src/llm/types.js";

function makeFailingAdapter(name: string): LLMAdapter {
  return {
    name,
    capabilities: { streaming: true, toolUse: false, vision: false, jsonMode: false },
    async complete() { throw new Error(`${name} failed`); },
    async *stream() { throw new Error(`${name} failed`); },
  };
}

describe("FallbackChain", () => {
  it("returns result from primary model", async () => {
    const registry = new AdapterRegistry();
    registry.register(new MockLLMAdapter({ responses: { default: "primary works" } }));
    const chain = new FallbackChain({ registry, chain: ["mock:model-a"], timeout: 5000 });
    const result = await chain.complete({ model: "mock:model-a", messages: [{ role: "user", content: "hi" }] });
    expect(result.content).toBe("primary works");
  });

  it("falls back to next model when primary fails", async () => {
    const registry = new AdapterRegistry();
    registry.register(makeFailingAdapter("bad"));
    registry.register(new MockLLMAdapter({ responses: { default: "fallback works" } }));
    const chain = new FallbackChain({ registry, chain: ["bad:model", "mock:model"], timeout: 5000 });
    const result = await chain.complete({ model: "bad:model", messages: [{ role: "user", content: "hi" }] });
    expect(result.content).toBe("fallback works");
  });

  it("returns static response when all models fail", async () => {
    const registry = new AdapterRegistry();
    registry.register(makeFailingAdapter("bad1"));
    registry.register(makeFailingAdapter("bad2"));
    const chain = new FallbackChain({
      registry, chain: ["bad1:m", "bad2:m"], timeout: 5000,
      staticResponses: { default: "All systems down. Please try later." },
    });
    const result = await chain.complete({ model: "bad1:m", messages: [{ role: "user", content: "hi" }] });
    expect(result.content).toBe("All systems down. Please try later.");
  });

  it("throws when all fail and no static response", async () => {
    const registry = new AdapterRegistry();
    registry.register(makeFailingAdapter("bad"));
    const chain = new FallbackChain({ registry, chain: ["bad:m"], timeout: 5000 });
    await expect(chain.complete({ model: "bad:m", messages: [{ role: "user", content: "hi" }] })).rejects.toThrow();
  });

  it("respects timeout", async () => {
    const slowAdapter: LLMAdapter = {
      name: "slow",
      capabilities: { streaming: true, toolUse: false, vision: false, jsonMode: false },
      async complete() {
        await new Promise((r) => setTimeout(r, 5000));
        return { content: "too late", usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
      },
      async *stream() { yield { type: "done" as const, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } }; },
    };
    const registry = new AdapterRegistry();
    registry.register(slowAdapter);
    registry.register(new MockLLMAdapter({ responses: { default: "fast fallback" } }));
    const chain = new FallbackChain({ registry, chain: ["slow:m", "mock:m"], timeout: 100 });
    const result = await chain.complete({ model: "slow:m", messages: [{ role: "user", content: "hi" }] });
    expect(result.content).toBe("fast fallback");
  });
});
