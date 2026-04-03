import { describe, it, expect } from "vitest";
import { compile } from "../src/compiler.js";
import { flow, when } from "../src/flow.js";
import { z } from "zod";

const schema = z.object({
  intent: z.string().optional(),
});

describe("FlowCompiler", () => {
  it("compiles a valid flow", () => {
    const f = flow("test", { state: schema })
      .node("start", async (ctx) => ctx.reply("hi"))
      .node("end", async (ctx) => ctx.reply("bye"))
      .edge("start", "end");
    const compiled = compile(f.build());
    expect(compiled.name).toBe("test");
    expect(compiled.entryNode).toBe("start");
  });

  it("detects the entry node (first node added)", () => {
    const f = flow("test", { state: schema })
      .node("greeting", async (ctx) => ctx.reply("hi"))
      .node("farewell", async (ctx) => ctx.reply("bye"))
      .edge("greeting", "farewell");
    const compiled = compile(f.build());
    expect(compiled.entryNode).toBe("greeting");
  });

  it("builds an edge map indexed by source node", () => {
    const f = flow("test", { state: schema })
      .node("a", async (ctx) => ctx.reply("a"))
      .node("b", async (ctx) => ctx.reply("b"))
      .node("c", async (ctx) => ctx.reply("c"))
      .edge("a", "b")
      .edge("a", "c", when("special"));
    const compiled = compile(f.build());
    expect(compiled.edgeMap.get("a")).toHaveLength(2);
    expect(compiled.edgeMap.has("b")).toBe(false);
  });

  it("throws on edge referencing non-existent node (from)", () => {
    const f = flow("test", { state: schema })
      .node("a", async (ctx) => ctx.reply("a"))
      .edge("ghost", "a");
    expect(() => compile(f.build())).toThrow(/ghost/);
  });

  it("throws on edge referencing non-existent node (to)", () => {
    const f = flow("test", { state: schema })
      .node("a", async (ctx) => ctx.reply("a"))
      .edge("a", "ghost");
    expect(() => compile(f.build())).toThrow(/ghost/);
  });

  it("throws on empty flow (no nodes)", () => {
    const f = flow("empty", { state: schema });
    expect(() => compile(f.build())).toThrow(/no nodes/i);
  });

  it("generates auto-reducers from schema", () => {
    const arraySchema = z.object({
      tags: z.array(z.string()).default([]),
      name: z.string().optional(),
    });
    const f = flow("test", { state: arraySchema })
      .node("a", async (ctx) => ctx.reply("a"));
    const compiled = compile(f.build());
    expect(compiled.reducers["tags"]).toBeDefined();
    expect(compiled.reducers["name"]).toBeUndefined();
  });
});
