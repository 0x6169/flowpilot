import { describe, it, expect } from "vitest";
import { HookRunner } from "../../src/hooks/runner.js";
import type { HookDefinition, HookResult } from "../../src/types.js";

describe("HookRunner", () => {
  it("executes hooks in order", async () => {
    const order: string[] = [];
    const hooks: HookDefinition[] = [
      { on: "before:node", handler: async () => { order.push("a"); } },
      { on: "before:node", handler: async () => { order.push("b"); } },
    ];
    const runner = new HookRunner(hooks);
    await runner.run("before:node", {});
    expect(order).toEqual(["a", "b"]);
  });

  it("only runs hooks matching the event", async () => {
    const called: string[] = [];
    const hooks: HookDefinition[] = [
      { on: "before:node", handler: async () => { called.push("node"); } },
      { on: "before:llm", handler: async () => { called.push("llm"); } },
    ];
    const runner = new HookRunner(hooks);
    await runner.run("before:node", {});
    expect(called).toEqual(["node"]);
  });

  it("returns 'block' result and stops execution", async () => {
    const hooks: HookDefinition[] = [
      { on: "before:turn", handler: async () => ({ block: "rate limited" }) },
      { on: "before:turn", handler: async () => { throw new Error("should not run"); } },
    ];
    const runner = new HookRunner(hooks);
    const result = await runner.run("before:turn", {});
    expect(result).toEqual({ block: "rate limited" });
  });

  it("returns 'redirect' result and stops", async () => {
    const hooks: HookDefinition[] = [
      { on: "before:node", handler: async () => ({ redirect: "error_node" }) },
    ];
    const runner = new HookRunner(hooks);
    const result = await runner.run("before:node", {});
    expect(result).toEqual({ redirect: "error_node" });
  });

  it("returns 'modify' result without stopping", async () => {
    const hooks: HookDefinition[] = [
      { on: "before:llm", handler: async () => ({ modify: { sanitized: true } }) },
      { on: "before:llm", handler: async () => {} },
    ];
    const runner = new HookRunner(hooks);
    const result = await runner.run("before:llm", {});
    expect(result).toEqual({ modify: { sanitized: true } });
  });

  it("returns void when no hooks match", async () => {
    const runner = new HookRunner([]);
    const result = await runner.run("before:node", {});
    expect(result).toBeUndefined();
  });

  it("catches hook errors without crashing", async () => {
    const hooks: HookDefinition[] = [
      { on: "before:node", handler: async () => { throw new Error("hook failed"); } },
    ];
    const runner = new HookRunner(hooks);
    const result = await runner.run("before:node", {});
    expect(result).toBeUndefined();
  });
});
