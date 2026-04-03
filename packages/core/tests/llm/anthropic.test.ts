import { describe, it, expect } from "vitest";
import { AnthropicAdapter } from "../../src/llm/anthropic.js";

describe("AnthropicAdapter", () => {
  it("has correct name and capabilities", () => {
    const adapter = new AnthropicAdapter({ apiKey: "test-key" });
    expect(adapter.name).toBe("anthropic");
    expect(adapter.capabilities.streaming).toBe(true);
    expect(adapter.capabilities.toolUse).toBe(true);
  });

  it("builds correct message format from LLMRequest", () => {
    const adapter = new AnthropicAdapter({ apiKey: "test-key" });
    const params = (adapter as any).buildParams({
      model: "claude-haiku-4-5",
      messages: [{ role: "user", content: "Hello" }],
      systemPrompt: "You are a helpful assistant.",
      maxTokens: 1024,
      temperature: 0.7,
    });
    expect(params.model).toBe("claude-haiku-4-5");
    expect(params.system).toBe("You are a helpful assistant.");
    expect(params.max_tokens).toBe(1024);
    expect(params.temperature).toBe(0.7);
    expect(params.messages).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("uses default maxTokens when not specified", () => {
    const adapter = new AnthropicAdapter({ apiKey: "test-key" });
    const params = (adapter as any).buildParams({
      model: "claude-haiku-4-5",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(params.max_tokens).toBe(4096);
  });

  it.skipIf(!process.env.ANTHROPIC_API_KEY)("completes a real request", async () => {
    const adapter = new AnthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const result = await adapter.complete({
      model: "claude-haiku-4-5",
      messages: [{ role: "user", content: "Say exactly: HELLO_FLOWPILOT" }],
      maxTokens: 50,
    });
    expect(result.content).toContain("HELLO_FLOWPILOT");
    expect(result.usage.totalTokens).toBeGreaterThan(0);
  });
});
