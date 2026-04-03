import { describe, it, expect } from "vitest";
import { ContextCompactor } from "../../src/tokens/compactor.js";
import { MockLLMAdapter } from "../../src/llm/mock.js";
import { AdapterRegistry } from "../../src/llm/registry.js";

describe("ContextCompactor", () => {
  function makeRegistry() {
    const registry = new AdapterRegistry();
    registry.register(new MockLLMAdapter({
      responses: { default: "Summary: The user greeted and asked about products." },
    }));
    registry.setDefault("mock:default");
    return registry;
  }

  it("compacts old messages into a summary", async () => {
    const compactor = new ContextCompactor({
      registry: makeRegistry(),
      model: "mock:default",
      preserveRecent: 2,
    });
    const messages = [
      { role: "user" as const, content: "Hello" },
      { role: "assistant" as const, content: "Hi there!" },
      { role: "user" as const, content: "Show me products" },
      { role: "assistant" as const, content: "Here are products..." },
      { role: "user" as const, content: "I want the blue one" },
      { role: "assistant" as const, content: "Great choice!" },
    ];
    const result = await compactor.compact(messages);
    expect(result.messages.length).toBeLessThan(messages.length);
    expect(result.messages[0].role).toBe("system");
    expect(result.messages[0].content).toContain("Summary");
    const lastMsg = result.messages[result.messages.length - 1];
    expect(lastMsg.content).toBe("Great choice!");
    expect(result.compacted).toBe(true);
  });

  it("skips compaction when messages are short", async () => {
    const compactor = new ContextCompactor({
      registry: makeRegistry(),
      model: "mock:default",
      preserveRecent: 10,
    });
    const messages = [
      { role: "user" as const, content: "Hi" },
      { role: "assistant" as const, content: "Hello!" },
    ];
    const result = await compactor.compact(messages);
    expect(result.messages).toEqual(messages);
    expect(result.compacted).toBe(false);
  });

  it("preserves slot data in summary", async () => {
    const compactor = new ContextCompactor({
      registry: makeRegistry(),
      model: "mock:default",
      preserveRecent: 1,
      preserveSlots: true,
    });
    const messages = [
      { role: "user" as const, content: "My name is Alice" },
      { role: "assistant" as const, content: "Hi Alice! What's your CPF?" },
      { role: "user" as const, content: "12345678900" },
      { role: "assistant" as const, content: "Got it." },
    ];
    const slotData = { name: "Alice", cpf: "12345678900" };
    const result = await compactor.compact(messages, slotData);
    expect(result.messages[0].content).toContain("name: Alice");
  });
});
