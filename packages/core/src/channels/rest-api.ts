import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import type { FlowEvent } from "../types.js";
import { SessionManager } from "./session-manager.js";
import type { ChannelAdapter } from "./types.js";

export interface RestApiConfig {
  sessionManager: SessionManager;
  port?: number;
}

function serializeEvent(event: FlowEvent): unknown {
  if (event.type === "error") {
    return {
      ...event,
      error: event.error instanceof Error ? event.error.message : String(event.error),
    };
  }
  return event;
}

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  setCorsHeaders(res);
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function sendEmpty(res: ServerResponse, statusCode: number): void {
  setCorsHeaders(res);
  res.writeHead(statusCode);
  res.end();
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      try {
        resolve(raw.length > 0 ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

export class RestApiAdapter implements ChannelAdapter {
  readonly name = "rest-api";
  readonly capabilities = {
    richText: false,
    buttons: false,
    images: false,
    quickReplies: false,
    typingIndicator: false,
  };

  private readonly config: RestApiConfig;
  private server: Server | null = null;

  constructor(config: RestApiConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    const port = this.config.port ?? 3000;

    this.server = createServer(async (req, res) => {
      // Handle preflight
      if (req.method === "OPTIONS") {
        sendEmpty(res, 204);
        return;
      }

      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      const pathname = url.pathname;
      const method = req.method ?? "GET";

      try {
        await this.route(req, res, method, pathname);
      } catch (err) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(port, () => resolve());
      this.server!.once("error", reject);
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) => {
      this.server!.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    this.server = null;
  }

  private async route(
    req: IncomingMessage,
    res: ServerResponse,
    method: string,
    pathname: string,
  ): Promise<void> {
    const sm = this.config.sessionManager;

    // GET /api/health
    if (method === "GET" && pathname === "/api/health") {
      sendJson(res, 200, { status: "ok" });
      return;
    }

    // GET /api/flows
    if (method === "GET" && pathname === "/api/flows") {
      sendJson(res, 200, { flows: sm.getFlowNames() });
      return;
    }

    // POST /api/conversations
    if (method === "POST" && pathname === "/api/conversations") {
      const body = await readBody(req) as { flowName?: string };
      const flowName = body.flowName;
      if (!flowName) {
        sendJson(res, 400, { error: "flowName is required" });
        return;
      }
      const sessionId = randomUUID();
      sm.getOrCreate(sessionId, flowName);
      sendJson(res, 201, { sessionId });
      return;
    }

    // POST /api/conversations/:id/messages
    const msgMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
    if (method === "POST" && msgMatch) {
      const sessionId = msgMatch[1];
      const conv = sm.get(sessionId);
      if (!conv) {
        sendJson(res, 404, { error: "Conversation not found" });
        return;
      }
      const body = await readBody(req) as { text?: string };
      const text = body.text ?? "";
      const events: unknown[] = [];
      for await (const event of conv.send(text)) {
        events.push(serializeEvent(event));
      }
      sendJson(res, 200, { events });
      return;
    }

    // GET /api/conversations/:id
    const convMatch = pathname.match(/^\/api\/conversations\/([^/]+)$/);
    if (method === "GET" && convMatch) {
      const sessionId = convMatch[1];
      const conv = sm.get(sessionId);
      if (!conv) {
        sendJson(res, 404, { error: "Conversation not found" });
        return;
      }
      sendJson(res, 200, { sessionId, status: conv.status });
      return;
    }

    // DELETE /api/conversations/:id
    if (method === "DELETE" && convMatch) {
      const sessionId = convMatch[1];
      const conv = sm.get(sessionId);
      if (!conv) {
        sendJson(res, 404, { error: "Conversation not found" });
        return;
      }
      sm.remove(sessionId);
      sendEmpty(res, 204);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  }
}
