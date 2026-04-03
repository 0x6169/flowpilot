import { describe, it, expect } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { createRequire } from "node:module";
import { SQLiteStore } from "../../src/store/sqlite.js";

let hasBetterSqlite3 = false;
try {
  const require = createRequire(import.meta.url);
  const Db = require("better-sqlite3");
  new Db(":memory:").close();
  hasBetterSqlite3 = true;
} catch {}

const describeIf = hasBetterSqlite3 ? describe : describe.skip;

function makeSnapshot(overrides: Partial<Parameters<SQLiteStore["save"]>[0]> = {}) {
  return {
    sessionId: "s1",
    flowName: "test",
    currentNode: "start",
    state: { name: "Alice" },
    messages: [],
    pendingPrompt: null,
    turn: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describeIf("SQLiteStore (ConversationStore)", () => {
  it("saves and loads a session", async () => {
    const store = new SQLiteStore({ path: ":memory:" });
    await store.connect();
    await store.save(makeSnapshot());
    const loaded = await store.load("s1");
    expect(loaded?.sessionId).toBe("s1");
    expect(loaded?.state.name).toBe("Alice");
    await store.disconnect();
  });

  it("returns null for missing session", async () => {
    const store = new SQLiteStore({ path: ":memory:" });
    await store.connect();
    expect(await store.load("ghost")).toBeNull();
    await store.disconnect();
  });

  it("deletes a session", async () => {
    const store = new SQLiteStore({ path: ":memory:" });
    await store.connect();
    await store.save(makeSnapshot());
    await store.delete("s1");
    expect(await store.load("s1")).toBeNull();
    await store.disconnect();
  });

  it("lists sessions ordered by updatedAt desc", async () => {
    const store = new SQLiteStore({ path: ":memory:" });
    await store.connect();
    await store.save(makeSnapshot({ sessionId: "s1", flowName: "flow1", updatedAt: 100 }));
    await store.save(makeSnapshot({ sessionId: "s2", flowName: "flow2", updatedAt: 200 }));
    const list = await store.list();
    expect(list).toHaveLength(2);
    expect(list[0].sessionId).toBe("s2");
    expect(list[1].sessionId).toBe("s1");
    await store.disconnect();
  });
});

describeIf("SQLiteStore (MemoryStore)", () => {
  it("sets and gets memory", async () => {
    const store = new SQLiteStore({ path: ":memory:" });
    await store.connect();
    await store.set("user1", "profile", "name", "Alice");
    const item = await store.get("user1", "profile", "name");
    expect(item?.value).toBe("Alice");
    await store.disconnect();
  });

  it("returns null for missing memory", async () => {
    const store = new SQLiteStore({ path: ":memory:" });
    await store.connect();
    expect(await store.get("user1", "ns", "key")).toBeNull();
    await store.disconnect();
  });

  it("deletes memory", async () => {
    const store = new SQLiteStore({ path: ":memory:" });
    await store.connect();
    await store.set("user1", "ns", "key", "val");
    await store.delete_memory("user1", "ns", "key");
    expect(await store.get("user1", "ns", "key")).toBeNull();
    await store.disconnect();
  });

  it("lists memory in namespace", async () => {
    const store = new SQLiteStore({ path: ":memory:" });
    await store.connect();
    await store.set("user1", "profile", "name", "Alice");
    await store.set("user1", "profile", "email", "alice@test.com");
    await store.set("user1", "prefs", "theme", "dark");
    const items = await store.list_memory("user1", "profile");
    expect(items).toHaveLength(2);
    await store.disconnect();
  });

  it("respects TTL", async () => {
    const store = new SQLiteStore({ path: ":memory:" });
    await store.connect();
    await store.set("user1", "ns", "key", "val", 0);
    await new Promise((r) => setTimeout(r, 10));
    expect(await store.get("user1", "ns", "key")).toBeNull();
    await store.disconnect();
  });

  it("persists data across operations (close and reopen)", async () => {
    const dbPath = join(tmpdir(), `talkgraph-test-${Date.now()}.db`);

    const store1 = new SQLiteStore({ path: dbPath });
    await store1.connect();
    await store1.save(makeSnapshot({ sessionId: "persist-1", flowName: "persistent-flow" }));
    await store1.set("userX", "cache", "token", "abc123");
    await store1.disconnect();

    const store2 = new SQLiteStore({ path: dbPath });
    await store2.connect();
    const session = await store2.load("persist-1");
    expect(session?.flowName).toBe("persistent-flow");
    const mem = await store2.get("userX", "cache", "token");
    expect(mem?.value).toBe("abc123");
    await store2.disconnect();

    // cleanup
    const { unlinkSync } = await import("fs");
    try { unlinkSync(dbPath); } catch { /* ignore */ }
    try { unlinkSync(dbPath + "-wal"); } catch { /* ignore */ }
    try { unlinkSync(dbPath + "-shm"); } catch { /* ignore */ }
  });
});
