import { describe, it, expect } from "vitest";
import { simulate } from "../../src/testing/simulate.js";
import { flow } from "../../src/flow.js";
import { z } from "zod";

describe("simulate()", () => {
  it("runs simple flow to completion", async () => {
    const f = flow("test", { state: z.object({}) })
      .node("start", async (ctx) => ctx.reply("Hello!"));

    const result = await simulate(f)
      .user("hi")
      .run();

    expect(result.completedSuccessfully).toBe(true);
    expect(result.turns).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
  });

  it("asserts bot replied with matching pattern", async () => {
    const f = flow("test", { state: z.object({}) })
      .node("start", async (ctx) => ctx.reply("Hello, world!"));

    const result = await simulate(f)
      .user("hi")
      .assertBotReplied(/Hello/)
      .run();

    expect(result.completedSuccessfully).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails assertion when pattern not matched", async () => {
    const f = flow("test", { state: z.object({}) })
      .node("start", async (ctx) => ctx.reply("Hello, world!"));

    const result = await simulate(f)
      .user("hi")
      .assertBotReplied(/Goodbye/)
      .run();

    expect(result.completedSuccessfully).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/Goodbye/);
  });

  it("handles multi-turn with ctx.prompt()", async () => {
    const f = flow("test", { state: z.object({ name: z.string().optional() }) })
      .node("ask", async (ctx) => {
        const name = await ctx.prompt("Name?");
        return ctx.reply(`Hi, ${name}!`);
      });

    const result = await simulate(f)
      .user("start")
      .user("Alice")
      .assertBotReplied(/Hi, Alice!/)
      .run();

    expect(result.completedSuccessfully).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("asserts node was reached", async () => {
    const f = flow("test", { state: z.object({}) })
      .node("greeting", async (ctx) => ctx.reply("Hi!"));

    const result = await simulate(f)
      .user("hi")
      .assertNodeReached("greeting")
      .run();

    expect(result.completedSuccessfully).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("asserts final state values", async () => {
    const f = flow("test", { state: z.object({ name: z.string().optional() }) })
      .node("start", async (ctx) => {
        return { type: "reply" as const, text: "Done", stateUpdate: { name: "Bob" } };
      });

    const result = await simulate(f)
      .user("hi")
      .assertState({ name: "Bob" })
      .run();

    expect(result.completedSuccessfully).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.finalState.name).toBe("Bob");
  });

  it("supports mocked tools option without affecting basic flow", async () => {
    const f = flow("test", { state: z.object({}) })
      .node("start", async (ctx) => ctx.reply("Done"));

    const result = await simulate(f, { mockedTools: { myTool: async () => "mocked result" } })
      .user("hi")
      .run();

    expect(result.completedSuccessfully).toBe(true);
  });
});
