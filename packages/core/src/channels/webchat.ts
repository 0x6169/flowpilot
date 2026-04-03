import { WebSocketServer, type WebSocket } from "ws";
import type { SessionManager } from "./session-manager.js";
import type { FlowEvent } from "../types.js";

interface WebChatConfig {
  port: number;
  sessionManager: SessionManager;
  defaultFlow: string;
}

interface ClientState {
  sessionId: string | null;
}

export class WebChatAdapter {
  private readonly config: WebChatConfig;
  private wss: WebSocketServer | null = null;

  constructor(config: WebChatConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    this.wss = new WebSocketServer({ port: this.config.port });
    this.wss.on("connection", (ws) => {
      const clientState: ClientState = { sessionId: null };
      ws.on("message", (data) => this.handleMessage(ws, clientState, data.toString()));
    });
    return new Promise<void>((resolve) => {
      this.wss!.on("listening", resolve);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.wss) return resolve();
      for (const client of this.wss.clients) client.close();
      this.wss.close((err) => (err ? reject(err) : resolve()));
    });
  }

  private async handleMessage(ws: WebSocket, clientState: ClientState, rawData: string): Promise<void> {
    try {
      const data = JSON.parse(rawData);
      if (data.type === "start") {
        const flowName = data.flowName ?? this.config.defaultFlow;
        const sessionId = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.config.sessionManager.getOrCreate(sessionId, flowName);
        clientState.sessionId = sessionId;
        this.sendJson(ws, { type: "session_created", sessionId });
        return;
      }
      if (data.type === "message") {
        if (!clientState.sessionId) {
          const sessionId = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          this.config.sessionManager.getOrCreate(sessionId, this.config.defaultFlow);
          clientState.sessionId = sessionId;
          this.sendJson(ws, { type: "session_created", sessionId });
        }
        const conv = this.config.sessionManager.get(clientState.sessionId!);
        if (!conv) {
          this.sendJson(ws, { type: "error", message: "Session not found" });
          return;
        }
        for await (const event of conv.send(data.text ?? "")) {
          this.sendFlowEvent(ws, event);
        }
      }
    } catch (err) {
      this.sendJson(ws, { type: "error", message: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  private sendFlowEvent(ws: WebSocket, event: FlowEvent): void {
    if (event.type === "error") {
      this.sendJson(ws, { type: "error", message: event.error.message, recoverable: event.recoverable });
    } else {
      this.sendJson(ws, event);
    }
  }

  private sendJson(ws: WebSocket, data: unknown): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }
}
