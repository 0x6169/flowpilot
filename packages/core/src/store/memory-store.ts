import type { ConversationStore, MemoryItem, SessionSnapshot } from "./types.js";

export class InMemoryStore implements ConversationStore {
  private sessions = new Map<string, SessionSnapshot>();
  private memory = new Map<string, MemoryItem>();

  // ── ConversationStore ────────────────────────────────────────────────────

  async connect(): Promise<void> {
    // no-op for in-memory store
  }

  async disconnect(): Promise<void> {
    // no-op for in-memory store
  }

  async save(snapshot: SessionSnapshot): Promise<void> {
    this.sessions.set(snapshot.sessionId, { ...snapshot });
  }

  async load(sessionId: string): Promise<SessionSnapshot | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async list(): Promise<Array<{ sessionId: string; flowName: string; updatedAt: number }>> {
    return Array.from(this.sessions.values()).map(({ sessionId, flowName, updatedAt }) => ({
      sessionId,
      flowName,
      updatedAt,
    }));
  }

  // ── MemoryStore ──────────────────────────────────────────────────────────

  private memoryKey(userId: string, namespace: string, key: string): string {
    return `${userId}:${namespace}:${key}`;
  }

  async get(userId: string, namespace: string, key: string): Promise<MemoryItem | null> {
    const item = this.memory.get(this.memoryKey(userId, namespace, key));
    if (!item) return null;
    if (item.expiresAt !== undefined && Date.now() > item.expiresAt) {
      this.memory.delete(this.memoryKey(userId, namespace, key));
      return null;
    }
    return item;
  }

  async set(
    userId: string,
    namespace: string,
    key: string,
    value: unknown,
    ttlSeconds?: number,
  ): Promise<void> {
    const now = Date.now();
    const item: MemoryItem = {
      key,
      value,
      updatedAt: now,
      expiresAt: ttlSeconds !== undefined ? now + ttlSeconds * 1000 : undefined,
    };
    this.memory.set(this.memoryKey(userId, namespace, key), item);
  }

  async deleteMemory(userId: string, namespace: string, key: string): Promise<void> {
    this.memory.delete(this.memoryKey(userId, namespace, key));
  }

  async listMemory(userId: string, namespace: string): Promise<MemoryItem[]> {
    const prefix = `${userId}:${namespace}:`;
    const now = Date.now();
    const results: MemoryItem[] = [];
    for (const [compositeKey, item] of this.memory.entries()) {
      if (!compositeKey.startsWith(prefix)) continue;
      if (item.expiresAt !== undefined && now > item.expiresAt) {
        this.memory.delete(compositeKey);
        continue;
      }
      results.push(item);
    }
    return results;
  }
}
