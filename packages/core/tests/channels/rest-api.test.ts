import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { z } from "zod";
import { flow } from "../../src/flow.js";
import { compile } from "../../src/compiler.js";
import { SessionManager } from "../../src/channels/session-manager.js";
import { RestApiAdapter } from "../../src/channels/rest-api.js";

const PORT = 9876 + Math.floor(Math.random() * 100);
const BASE = `http://localhost:${PORT}`;

function makeCompiledFlows() {
  const f = flow("test", { state: z.object({ name: z.string().optional() }) })
    .node("ask", async (ctx) => {
      const name = await ctx.prompt("Name?");
      return { type: "reply" as const, text: `Hi ${name}`, stateUpdate: { name } };
    });
  return new Map([["test", compile(f.build())]]);
}

let adapter: RestApiAdapter;

beforeAll(async () => {
  const sessionManager = new SessionManager({ compiledFlows: makeCompiledFlows() });
  adapter = new RestApiAdapter({ sessionManager, port: PORT });
  await adapter.start();
});

afterAll(async () => {
  await adapter.stop();
});

describe("REST API Adapter", () => {
  it("POST /api/conversations → 201 with sessionId", async () => {
    const res = await fetch(`${BASE}/api/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flowName: "test" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("sessionId");
    expect(typeof body.sessionId).toBe("string");
  });

  it("POST /api/conversations/:id/messages → 200 with events array", async () => {
    // First create a conversation
    const createRes = await fetch(`${BASE}/api/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flowName: "test" }),
    });
    const { sessionId } = await createRes.json();

    // Send a message
    const res = await fetch(`${BASE}/api/conversations/${sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Alice" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("events");
    expect(Array.isArray(body.events)).toBe(true);
  });

  it("GET /api/conversations/:id → 200 with status", async () => {
    const createRes = await fetch(`${BASE}/api/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flowName: "test" }),
    });
    const { sessionId } = await createRes.json();

    const res = await fetch(`${BASE}/api/conversations/${sessionId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("sessionId", sessionId);
    expect(body).toHaveProperty("status");
  });

  it("DELETE /api/conversations/:id → 204 + subsequent GET returns 404", async () => {
    const createRes = await fetch(`${BASE}/api/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flowName: "test" }),
    });
    const { sessionId } = await createRes.json();

    const delRes = await fetch(`${BASE}/api/conversations/${sessionId}`, {
      method: "DELETE",
    });
    expect(delRes.status).toBe(204);

    const getRes = await fetch(`${BASE}/api/conversations/${sessionId}`);
    expect(getRes.status).toBe(404);
  });

  it("GET /api/flows → 200 with flows array", async () => {
    const res = await fetch(`${BASE}/api/flows`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("flows");
    expect(Array.isArray(body.flows)).toBe(true);
    expect(body.flows).toContain("test");
  });

  it("GET /api/health → 200 with { status: 'ok' }", async () => {
    const res = await fetch(`${BASE}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });

  it("GET unknown conversation → 404", async () => {
    const res = await fetch(`${BASE}/api/conversations/nonexistent-session-id`);
    expect(res.status).toBe(404);
  });
});
