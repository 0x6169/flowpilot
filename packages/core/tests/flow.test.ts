import { describe, it, expect } from "vitest";
import { flow, when } from "../src/flow.js";
import { z } from "zod";

const schema = z.object({
  intent: z.string().optional(),
});

describe("FlowBuilder", () => {
  it("creates a flow with name and state schema", () => {
    const f = flow("test", { state: schema });
    const def = f.build();
    expect(def.name).toBe("test");
  });

  it("adds nodes with handlers", () => {
    const f = flow("test", { state: schema })
      .node("start", async (ctx) => ctx.reply("hi"))
      .node("end", async (ctx) => ctx.reply("bye"));
    const def = f.build();
    expect(def.nodes.size).toBe(2);
    expect(def.nodes.has("start")).toBe(true);
    expect(def.nodes.has("end")).toBe(true);
  });

  it("adds static edges", () => {
    const f = flow("test", { state: schema })
      .node("a", async (ctx) => ctx.reply("a"))
      .node("b", async (ctx) => ctx.reply("b"))
      .edge("a", "b");
    const def = f.build();
    expect(def.edges).toHaveLength(1);
    expect(def.edges[0]).toEqual({ from: "a", to: "b", condition: undefined });
  });

  it("adds conditional edges with when()", () => {
    const f = flow("test", { state: schema })
      .node("start", async (ctx) => ctx.reply("hi"))
      .node("buy", async (ctx) => ctx.reply("buy"))
      .edge("start", "buy", when("compra"));
    const def = f.build();
    expect(def.edges).toHaveLength(1);
    expect(def.edges[0].condition).toBeDefined();
    expect(def.edges[0].condition!({ intent: "compra" })).toBe(true);
    expect(def.edges[0].condition!({ intent: "suporte" })).toBe(false);
  });

  it("supports node config (model override)", () => {
    const f = flow("test", { state: schema })
      .node("start", async (ctx) => ctx.reply("hi"), { model: "ollama:llama3" });
    const def = f.build();
    expect(def.nodes.get("start")!.config?.model).toBe("ollama:llama3");
  });

  it("throws on duplicate node names", () => {
    expect(() => {
      flow("test", { state: schema })
        .node("start", async (ctx) => ctx.reply("hi"))
        .node("start", async (ctx) => ctx.reply("hi2"));
    }).toThrow(/duplicate/i);
  });

  it("is chainable (fluent API)", () => {
    const f = flow("test", { state: schema })
      .node("a", async (ctx) => ctx.reply("a"))
      .node("b", async (ctx) => ctx.reply("b"))
      .edge("a", "b");
    expect(f.build).toBeDefined();
  });
});

describe("when()", () => {
  it("matches string against any state field value", () => {
    const cond = when("compra");
    expect(cond({ intent: "compra" })).toBe(true);
    expect(cond({ intent: "suporte" })).toBe(false);
  });

  it("matches function condition", () => {
    const cond = when((state: Record<string, unknown>) => (state.count as number) > 5);
    expect(cond({ count: 10 })).toBe(true);
    expect(cond({ count: 2 })).toBe(false);
  });
});
