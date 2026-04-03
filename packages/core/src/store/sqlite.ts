import type Database from "better-sqlite3";
import { createRequire } from "node:module";
import type { ConversationStore, SessionSnapshot, MemoryItem } from "./types.js";

interface SQLiteStoreConfig {
  path?: string; // default: "./talkgraph.db"
}

export class SQLiteStore implements ConversationStore {
  private db!: Database.Database;
  private dbPath: string;

  constructor(config?: SQLiteStoreConfig) {
    this.dbPath = config?.path ?? "./talkgraph.db";
  }

  async connect(): Promise<void> {
    const require = createRequire(import.meta.url);
    let BetterSqlite3: typeof Database;
    try {
      BetterSqlite3 = require("better-sqlite3");
    } catch {
      throw new Error(
        "better-sqlite3 is required for SQLiteStore. Install it with: npm install better-sqlite3",
      );
    }
    this.db = new BetterSqlite3(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        flow_name TEXT NOT NULL,
        current_node TEXT NOT NULL,
        state TEXT NOT NULL,
        messages TEXT NOT NULL,
        pending_prompt TEXT,
        turn INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory (
        user_id TEXT NOT NULL,
        namespace TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER,
        PRIMARY KEY (user_id, namespace, key)
      )
    `);
  }

  async disconnect(): Promise<void> {
    this.db.close();
  }

  // --- ConversationStore ---

  async save(snapshot: SessionSnapshot): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sessions (session_id, flow_name, current_node, state, messages, pending_prompt, turn, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      snapshot.sessionId,
      snapshot.flowName,
      snapshot.currentNode,
      JSON.stringify(snapshot.state),
      JSON.stringify(snapshot.messages),
      snapshot.pendingPrompt ? JSON.stringify(snapshot.pendingPrompt) : null,
      snapshot.turn,
      snapshot.createdAt,
      snapshot.updatedAt,
    );
  }

  async load(sessionId: string): Promise<SessionSnapshot | null> {
    const row = this.db
      .prepare("SELECT * FROM sessions WHERE session_id = ?")
      .get(sessionId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      sessionId: row.session_id as string,
      flowName: row.flow_name as string,
      currentNode: row.current_node as string,
      state: JSON.parse(row.state as string),
      messages: JSON.parse(row.messages as string),
      pendingPrompt: row.pending_prompt
        ? JSON.parse(row.pending_prompt as string)
        : null,
      turn: row.turn as number,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  async delete(sessionId: string): Promise<void> {
    this.db
      .prepare("DELETE FROM sessions WHERE session_id = ?")
      .run(sessionId);
  }

  async list(): Promise<
    Array<{ sessionId: string; flowName: string; updatedAt: number }>
  > {
    const rows = this.db
      .prepare(
        "SELECT session_id, flow_name, updated_at FROM sessions ORDER BY updated_at DESC",
      )
      .all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      sessionId: row.session_id as string,
      flowName: row.flow_name as string,
      updatedAt: row.updated_at as number,
    }));
  }

  // --- MemoryStore (manual implementation, avoids conflict with ConversationStore.delete/list) ---

  async get(
    userId: string,
    namespace: string,
    key: string,
  ): Promise<MemoryItem | null> {
    const row = this.db
      .prepare(
        "SELECT * FROM memory WHERE user_id = ? AND namespace = ? AND key = ?",
      )
      .get(userId, namespace, key) as Record<string, unknown> | undefined;
    if (!row) return null;
    const expiresAt = row.expires_at as number | null;
    if (expiresAt && Date.now() >= expiresAt) {
      this.db
        .prepare(
          "DELETE FROM memory WHERE user_id = ? AND namespace = ? AND key = ?",
        )
        .run(userId, namespace, key);
      return null;
    }
    return {
      key: row.key as string,
      value: JSON.parse(row.value as string),
      updatedAt: row.updated_at as number,
      expiresAt: expiresAt ?? undefined,
    };
  }

  async set(
    userId: string,
    namespace: string,
    key: string,
    value: unknown,
    ttlSeconds?: number,
  ): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO memory (user_id, namespace, key, value, updated_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      userId,
      namespace,
      key,
      JSON.stringify(value),
      Date.now(),
      ttlSeconds !== undefined ? Date.now() + ttlSeconds * 1000 : null,
    );
  }

  async delete_memory(
    userId: string,
    namespace: string,
    key: string,
  ): Promise<void> {
    this.db
      .prepare(
        "DELETE FROM memory WHERE user_id = ? AND namespace = ? AND key = ?",
      )
      .run(userId, namespace, key);
  }

  async list_memory(userId: string, namespace: string): Promise<MemoryItem[]> {
    const now = Date.now();
    const rows = this.db
      .prepare(
        "SELECT * FROM memory WHERE user_id = ? AND namespace = ? AND (expires_at IS NULL OR expires_at > ?)",
      )
      .all(userId, namespace, now) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      key: row.key as string,
      value: JSON.parse(row.value as string),
      updatedAt: row.updated_at as number,
      expiresAt: (row.expires_at as number | null) ?? undefined,
    }));
  }
}

export function sqliteStore(config?: SQLiteStoreConfig): SQLiteStore {
  return new SQLiteStore(config);
}
