import { describe, it, expect } from "vitest";
import { MockLLMAdapter } from "../src/llm/mock.js";

describe("MockLLMAdapter", () => {
  it("returns canned response via complete()", async () => {
    const adapter = new MockLLMAdapter({
      responses: { default: "Hello from mock!" },
    });
    const result = await adapter.complete({
      model: "mock:default",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.content).toBe("Hello from mock!");
    expect(result.usage.totalTokens).toBeGreaterThan(0);
  });

  it("streams tokens via stream()", async () => {
    const adapter = new MockLLMAdapter({
      responses: { default: "Hello world" },
    });
    const tokens: string[] = [];
    for await (const event of adapter.stream({
      model: "mock:default",
      messages: [{ role: "user", content: "hi" }],
    })) {
      if (event.type === "token") tokens.push(event.text);
    }
    expect(tokens.join("")).toBe("Hello world");
  });

  it("matches response by pattern in last message", async () => {
    const adapter = new MockLLMAdapter({
      responses: {
        default: "default response",
        "weather": "It's sunny!",
      },
    });
    const result = await adapter.complete({
      model: "mock:default",
      messages: [{ role: "user", content: "what's the weather?" }],
    });
    expect(result.content).toBe("It's sunny!");
  });

  it("reports capabilities", () => {
    const adapter = new MockLLMAdapter({ responses: {} });
    expect(adapter.name).toBe("mock");
    expect(adapter.capabilities.streaming).toBe(true);
  });
});
