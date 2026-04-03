export interface SessionSnapshot {
  sessionId: string;
  flowName: string;
  currentNode: string;
  state: Record<string, unknown>;
  messages: Array<{ role: string; content: string; timestamp: number }>;
  pendingPrompt: PendingPrompt | null;
  turn: number;
  createdAt: number;
  updatedAt: number;
}

export interface PendingPrompt {
  question: string;
  nodeName: string;
  style: "structured" | "natural";
  options?: Array<{ label: string; value: string }>;
}

export interface ConversationStore {
  save(snapshot: SessionSnapshot): Promise<void>;
  load(sessionId: string): Promise<SessionSnapshot | null>;
  delete(sessionId: string): Promise<void>;
  list(): Promise<Array<{ sessionId: string; flowName: string; updatedAt: number }>>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export interface MemoryItem {
  key: string;
  value: unknown;
  updatedAt: number;
  expiresAt?: number;
}

export interface MemoryStore {
  get(userId: string, namespace: string, key: string): Promise<MemoryItem | null>;
  set(userId: string, namespace: string, key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  delete(userId: string, namespace: string, key: string): Promise<void>;
  list(userId: string, namespace: string): Promise<MemoryItem[]>;
}
