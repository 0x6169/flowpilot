import { describe, it, expect } from "vitest";
import { Conversation } from "../src/conversation.js";
import { flow } from "../src/flow.js";
import { compile } from "../src/compiler.js";
import { z } from "zod";
import type { FlowEvent } from "../src/types.js";
import { InMemoryStore } from "../src/store/memory-store.js";

async function collectEvents(gen: AsyncGenerator<FlowEvent>): Promise<FlowEvent[]> {
  const events: FlowEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

describe("Conversation", () => {
  it("runs a simple flow without prompts", async () => {
    const f = flow("test", { state: z.object({}) })
      .node("start", async (ctx) => ctx.reply("Hello!"));
    const compiled = compile(f.build());
    const conv = new Conversation({ compiled, sessionId: "s1" });
    const events = await collectEvents(conv.send("hi"));
    const messages = events.filter(e => e.type === "message").map(e => (e as any).text);
    expect(messages).toEqual(["Hello!"]);
    expect(events.some(e => e.type === "flow:complete")).toBe(true);
  });

  it("handles ctx.prompt() — suspends and resumes", async () => {
    const f = flow("test", { state: z.object({ name: z.string().optional() }) })
      .node("ask", async (ctx) => {
        const name = await ctx.prompt("What is your name?");
        return ctx.replyAndGoto(`Hello, ${name}!`, "done");
      })
      .node("done", async (ctx) => ctx.reply("Bye!"))
      .edge("ask", "done");
    const compiled = compile(f.build());
    const conv = new Conversation({ compiled, sessionId: "s1" });

    // Turn 1: bot asks
    const events1 = await collectEvents(conv.send("start"));
    const prompt = events1.find(e => e.type === "prompt:send") as any;
    expect(prompt).toBeDefined();
    expect(prompt.question).toBe("What is your name?");
    expect(events1.some(e => e.type === "flow:complete")).toBe(false);

    // Turn 2: user responds
    const events2 = await collectEvents(conv.send("Alice"));
    const messages = events2.filter(e => e.type === "message").map(e => (e as any).text);
    expect(messages).toContain("Hello, Alice!");
    expect(messages).toContain("Bye!");
    expect(events2.some(e => e.type === "flow:complete")).toBe(true);
  });

  it("handles multiple prompts in sequence", async () => {
    const f = flow("test", { state: z.object({ name: z.string().optional(), color: z.string().optional() }) })
      .node("ask", async (ctx) => {
        const name = await ctx.prompt("Your name?");
        const color = await ctx.prompt("Favorite color?");
        return { type: "reply" as const, text: `Hi ${name}, you like ${color}!`, stateUpdate: { name, color } };
      });
    const compiled = compile(f.build());
    const conv = new Conversation({ compiled, sessionId: "s1" });

    const e1 = await collectEvents(conv.send("start"));
    expect(e1.find(e => e.type === "prompt:send")).toBeDefined();

    const e2 = await collectEvents(conv.send("Bob"));
    const prompt2 = e2.find(e => e.type === "prompt:send") as any;
    expect(prompt2.question).toBe("Favorite color?");

    const e3 = await collectEvents(conv.send("blue"));
    const msgs = e3.filter(e => e.type === "message").map(e => (e as any).text);
    expect(msgs).toContain("Hi Bob, you like blue!");
  });

  it("exposes conversation status", async () => {
    const f = flow("test", { state: z.object({}) })
      .node("ask", async (ctx) => {
        await ctx.prompt("Name?");
        return ctx.reply("Done");
      });
    const compiled = compile(f.build());
    const conv = new Conversation({ compiled, sessionId: "s1" });
    expect(conv.status).toBe("idle");
    await collectEvents(conv.send("hi"));
    expect(conv.status).toBe("waiting_for_input");
    await collectEvents(conv.send("Alice"));
    expect(conv.status).toBe("completed");
  });

  it("persists session to store", async () => {
    const store = new InMemoryStore();
    await store.connect();
    const f = flow("test", { state: z.object({ name: z.string().optional() }) })
      .node("ask", async (ctx) => {
        const name = await ctx.prompt("Name?");
        return { type: "reply" as const, text: `Hi ${name}`, stateUpdate: { name } };
      });
    const compiled = compile(f.build());
    const conv = new Conversation({ compiled, sessionId: "s1", store });
    await collectEvents(conv.send("hi"));
    const snapshot = await store.load("s1");
    expect(snapshot).not.toBeNull();
    expect(snapshot!.pendingPrompt).not.toBeNull();
  });
});
