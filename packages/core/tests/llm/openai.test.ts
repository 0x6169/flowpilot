import { describe, it, expect } from "vitest";
import { OpenAIAdapter } from "../../src/llm/openai.js";

describe("OpenAIAdapter", () => {
  it("has correct name and capabilities", () => {
    const adapter = new OpenAIAdapter({ apiKey: "test-key" });
    expect(adapter.name).toBe("openai");
    expect(adapter.capabilities.streaming).toBe(true);
    expect(adapter.capabilities.jsonMode).toBe(true);
  });

  it("builds correct message format", () => {
    const adapter = new OpenAIAdapter({ apiKey: "test-key" });
    const params = (adapter as any).buildParams({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Hello" }],
      systemPrompt: "You are helpful.",
      maxTokens: 500,
      temperature: 0.5,
    });
    expect(params.model).toBe("gpt-4o-mini");
    expect(params.max_tokens).toBe(500);
    expect(params.temperature).toBe(0.5);
    expect(params.messages[0]).toEqual({ role: "system", content: "You are helpful." });
    expect(params.messages[1]).toEqual({ role: "user", content: "Hello" });
  });

  it("uses default maxTokens", () => {
    const adapter = new OpenAIAdapter({ apiKey: "test-key" });
    const params = (adapter as any).buildParams({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(params.max_tokens).toBe(4096);
  });

  it.skipIf(!process.env.OPENAI_API_KEY)("completes a real request", async () => {
    const adapter = new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY! });
    const result = await adapter.complete({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Say exactly: HELLO_TALKGRAPH" }],
      maxTokens: 50,
    });
    expect(result.content).toContain("HELLO_TALKGRAPH");
  });
});
