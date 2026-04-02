import { describe, it, expect } from "vitest";
import { Conversation } from "../src/conversation.js";
import { flow } from "../src/flow.js";
import { compile } from "../src/compiler.js";
import { z } from "zod";
import type { FlowEvent } from "../src/types.js";

async function collectEvents(gen: AsyncGenerator<FlowEvent>): Promise<FlowEvent[]> {
  const events: FlowEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

describe("ctx.promptWithOptions()", () => {
  it("sends options and returns response", async () => {
    const f = flow("test", { state: z.object({ choice: z.string().optional() }) })
      .node("ask", async (ctx) => {
        const choice = await ctx.promptWithOptions("Pick:", [
          { label: "A", value: "a" },
          { label: "B", value: "b" },
        ]);
        return { type: "reply" as const, text: `Picked: ${choice}`, stateUpdate: { choice } };
      });
    const compiled = compile(f.build());
    const conv = new Conversation({ compiled, sessionId: "s1" });

    const e1 = await collectEvents(conv.send("start"));
    const prompt = e1.find(e => e.type === "prompt:send") as any;
    expect(prompt.options).toHaveLength(2);

    const e2 = await collectEvents(conv.send("a"));
    expect(e2.filter(e => e.type === "message").map(e => (e as any).text)).toContain("Picked: a");
  });
});

describe("ctx.fillSlots()", () => {
  it("collects multiple slots", async () => {
    const f = flow("test", { state: z.object({ name: z.string().optional(), email: z.string().optional() }) })
      .node("collect", async (ctx) => {
        const data = await ctx.fillSlots({
          name: { prompt: "Your name?" },
          email: { prompt: "Your email?" },
        });
        return { type: "reply" as const, text: `Got: ${data.name}, ${data.email}`, stateUpdate: data };
      });
    const compiled = compile(f.build());
    const conv = new Conversation({ compiled, sessionId: "s1" });

    const e1 = await collectEvents(conv.send("start"));
    expect((e1.find(e => e.type === "prompt:send") as any).question).toBe("Your name?");

    const e2 = await collectEvents(conv.send("Alice"));
    expect((e2.find(e => e.type === "prompt:send") as any).question).toBe("Your email?");

    const e3 = await collectEvents(conv.send("alice@test.com"));
    expect(e3.filter(e => e.type === "message").map(e => (e as any).text)).toContain("Got: Alice, alice@test.com");
  });

  it("validates and re-prompts", async () => {
    const f = flow("test", { state: z.object({ age: z.number().optional() }) })
      .node("collect", async (ctx) => {
        const data = await ctx.fillSlots({
          age: {
            prompt: "Your age?",
            validate: z.coerce.number().min(1).max(150),
            errorMessage: "Enter a valid age (1-150).",
          },
        });
        return { type: "reply" as const, text: `Age: ${data.age}`, stateUpdate: { age: data.age as number } };
      });
    const compiled = compile(f.build());
    const conv = new Conversation({ compiled, sessionId: "s1" });

    await collectEvents(conv.send("start"));

    const e2 = await collectEvents(conv.send("abc"));
    expect((e2.find(e => e.type === "prompt:send") as any).question).toContain("valid age");

    const e3 = await collectEvents(conv.send("25"));
    expect(e3.filter(e => e.type === "message").map(e => (e as any).text)).toContain("Age: 25");
  });

  it("skips slots with skip:true", async () => {
    const f = flow("test", { state: z.object({ name: z.string().optional(), email: z.string().optional() }) })
      .node("collect", async (ctx) => {
        const data = await ctx.fillSlots({
          name: { prompt: "Name?", skip: true, defaultValue: "Default" },
          email: { prompt: "Email?" },
        });
        return { type: "reply" as const, text: `${data.name}, ${data.email}`, stateUpdate: data };
      });
    const compiled = compile(f.build());
    const conv = new Conversation({ compiled, sessionId: "s1" });

    const e1 = await collectEvents(conv.send("start"));
    expect((e1.find(e => e.type === "prompt:send") as any).question).toBe("Email?");

    const e2 = await collectEvents(conv.send("a@b.com"));
    expect(e2.filter(e => e.type === "message").map(e => (e as any).text)).toContain("Default, a@b.com");
  });
});
