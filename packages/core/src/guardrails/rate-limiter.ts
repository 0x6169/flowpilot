// src/guardrails/rate-limiter.ts
import type { HookDefinition, HookResult } from "../types.js";

export interface RateLimiterOptions {
  max: number;
  window: string;
}

function parseWindow(windowStr: string): number {
  const msMatch = windowStr.match(/^(\d+)ms$/);
  if (msMatch) {
    return parseInt(msMatch[1], 10);
  }
  const sMatch = windowStr.match(/^(\d+)s$/);
  if (sMatch) {
    return parseInt(sMatch[1], 10) * 1000;
  }
  const mMatch = windowStr.match(/^(\d+)m$/);
  if (mMatch) {
    return parseInt(mMatch[1], 10) * 60000;
  }
  throw new Error(`Invalid window format: ${windowStr}`);
}

export function rateLimiter(options: RateLimiterOptions): HookDefinition {
  const { max } = options;
  const windowMs = parseWindow(options.window);
  const sessions = new Map<string, number[]>();

  return {
    on: "before:turn",
    handler: async (ctx: unknown): Promise<HookResult> => {
      const context = ctx as { sessionId: string };
      const { sessionId } = context;
      const now = Date.now();

      const timestamps = sessions.get(sessionId) ?? [];
      const cutoff = now - windowMs;
      const active = timestamps.filter((t) => t > cutoff);

      if (active.length >= max) {
        sessions.set(sessionId, active);
        return { block: `Rate limit exceeded. Max ${max} requests per ${options.window}.` };
      }

      active.push(now);
      sessions.set(sessionId, active);
      return undefined;
    },
  };
}
