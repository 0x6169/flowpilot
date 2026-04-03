// Simple in-process scheduler using setTimeout
// parseDelay: "24h" → ms, "5m" → ms, "30s" → ms, "100ms" → ms

export class Scheduler {
  private timers = new Map<string, NodeJS.Timeout>();

  schedule(id: string, delayMs: number, handler: () => void | Promise<void>): void {
    const timer = setTimeout(async () => {
      this.timers.delete(id);
      try { await handler(); } catch { /* swallow errors */ }
    }, delayMs);
    this.timers.set(id, timer);
  }

  cancel(id: string): boolean {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
      return true;
    }
    return false;
  }

  cancelAll(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  get activeCount(): number {
    return this.timers.size;
  }
}

export function parseDelay(delay: string): number {
  const match = delay.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) throw new Error(`Invalid delay format: "${delay}". Use: 100ms, 30s, 5m, 24h, 7d`);
  const [, value, unit] = match;
  const num = parseInt(value, 10);
  switch (unit) {
    case "ms": return num;
    case "s": return num * 1000;
    case "m": return num * 60_000;
    case "h": return num * 3_600_000;
    case "d": return num * 86_400_000;
    default: return num;
  }
}
