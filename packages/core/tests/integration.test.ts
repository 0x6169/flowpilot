import { describe, it, expect } from "vitest";
import { flow, when, createTalkGraph, defineTool } from "../src/index.js";
import { z } from "zod";
import type { FlowEvent } from "../src/index.js";

describe("TalkGraph Integration", () => {
  it("runs a complete multi-node flow with state and edges", async () => {
    const myFlow = flow("greeting", {
      state: z.object({
        name: z.string().optional(),
        greeted: z.boolean().default(false),
      }),
    })
      .node("welcome", async (ctx) => {
        return ctx.replyAndGoto("Welcome! What is your name?", "process");
      })
      .node("process", async (ctx) => {
        return {
          type: "reply_goto" as const,
          text: "Nice to meet you!",
          gotoNode: "farewell",
          stateUpdate: { name: "User", greeted: true },
        };
      })
      .node("farewell", async (ctx) => {
        expect(ctx.state.greeted).toBe(true);
        return ctx.reply(`Goodbye, ${ctx.state.name}!`);
      })
      .edge("welcome", "process")
      .edge("process", "farewell");

    const app = createTalkGraph({ flows: [myFlow] });

    const events: FlowEvent[] = [];
    for await (const event of app.run("greeting")) {
      events.push(event);
    }

    const messages = events
      .filter((e) => e.type === "message")
      .map((e) => (e as any).text);
    expect(messages).toEqual([
      "Welcome! What is your name?",
      "Nice to meet you!",
      "Goodbye, User!",
    ]);

    const complete = events.find((e) => e.type === "flow:complete") as any;
    expect(complete.finalState.name).toBe("User");
    expect(complete.finalState.greeted).toBe(true);

    const nodeEvents = events.filter(
      (e) => e.type === "node:enter" || e.type === "node:exit",
    );
    const nodeNames = nodeEvents.map((e) => `${e.type}:${(e as any).node}`);
    expect(nodeNames).toEqual([
      "node:enter:welcome",
      "node:exit:welcome",
      "node:enter:process",
      "node:exit:process",
      "node:enter:farewell",
      "node:exit:farewell",
    ]);
  });

  it("runs flow with conditional edges", async () => {
    const myFlow = flow("router", {
      state: z.object({
        intent: z.string().optional(),
        result: z.string().optional(),
      }),
    })
      .node("classify", async (ctx) => {
        return {
          type: "goto" as const,
          gotoNode: "buy",
          stateUpdate: { intent: "buy" },
        };
      })
      .node("buy", async (ctx) => {
        return {
          type: "reply" as const,
          text: "Let's buy!",
          stateUpdate: { result: "purchase_started" },
        };
      })
      .node("support", async (ctx) => {
        return ctx.reply("How can I help?");
      })
      .edge("classify", "buy", when("buy"))
      .edge("classify", "support", when("support"));

    const app = createTalkGraph({ flows: [myFlow] });

    const events: FlowEvent[] = [];
    for await (const event of app.run("router")) {
      events.push(event);
    }

    const messages = events
      .filter((e) => e.type === "message")
      .map((e) => (e as any).text);
    expect(messages).toEqual(["Let's buy!"]);
  });

  it("lists available flows", () => {
    const f1 = flow("vendas", { state: z.object({}) })
      .node("start", async (ctx) => ctx.reply("hi"));
    const f2 = flow("suporte", { state: z.object({}) })
      .node("start", async (ctx) => ctx.reply("hello"));
    const app = createTalkGraph({ flows: [f1, f2] });
    expect(app.listFlows().sort()).toEqual(["suporte", "vendas"]);
  });

  it("throws on unknown flow name", () => {
    const app = createTalkGraph({ flows: [] });
    expect(() => app.run("ghost")).toThrow(/ghost/);
  });

  it("collects all event types in correct order", async () => {
    const myFlow = flow("simple", {
      state: z.object({ done: z.boolean().default(false) }),
    })
      .node("only", async (ctx) => {
        return {
          type: "reply" as const,
          text: "Done!",
          stateUpdate: { done: true },
        };
      });

    const app = createTalkGraph({ flows: [myFlow] });

    const types: string[] = [];
    for await (const event of app.run("simple")) {
      types.push(event.type);
    }

    expect(types).toEqual([
      "node:enter",
      "state:update",
      "message",
      "node:exit",
      "flow:complete",
    ]);
  });
});
