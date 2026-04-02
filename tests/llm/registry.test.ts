import { describe, it, expect } from "vitest";
import { AdapterRegistry } from "../../src/llm/registry.js";
import { MockLLMAdapter } from "../../src/llm/mock.js";

describe("AdapterRegistry", () => {
  it("registers and resolves adapter by name", () => {
    const registry = new AdapterRegistry();
    const mock = new MockLLMAdapter({ responses: { default: "hi" } });
    registry.register(mock);
    expect(registry.resolve("mock:anything")).toBe(mock);
  });

  it("extracts model name from provider:model string", () => {
    const registry = new AdapterRegistry();
    const mock = new MockLLMAdapter({ responses: { default: "hi" } });
    registry.register(mock);
    const { adapter, model } = registry.resolveWithModel("mock:gpt-4");
    expect(adapter).toBe(mock);
    expect(model).toBe("gpt-4");
  });

  it("throws on unregistered provider", () => {
    const registry = new AdapterRegistry();
    expect(() => registry.resolve("ghost:model")).toThrow(/ghost/);
  });

  it("sets and resolves default model", () => {
    const registry = new AdapterRegistry();
    const mock = new MockLLMAdapter({ responses: { default: "hi" } });
    registry.register(mock);
    registry.setDefault("mock:default-model");
    const { adapter, model } = registry.resolveDefault();
    expect(adapter).toBe(mock);
    expect(model).toBe("default-model");
  });

  it("throws on resolveDefault when no default set", () => {
    const registry = new AdapterRegistry();
    expect(() => registry.resolveDefault()).toThrow(/no default/i);
  });

  it("lists registered adapters", () => {
    const registry = new AdapterRegistry();
    registry.register(new MockLLMAdapter({ responses: {} }));
    expect(registry.list()).toEqual(["mock"]);
  });
});
