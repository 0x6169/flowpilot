// src/guardrails/pii-guard.ts
import type { HookDefinition, HookResult } from "../types.js";

export type PiiType = "email" | "creditCard" | "cpf" | "phone";
export type PiiStrategy = "redact" | "mask" | "block";

export interface PiiGuardOptions {
  types?: PiiType[];
  strategy?: PiiStrategy;
}

const patterns: Record<PiiType, RegExp> = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  creditCard: /\b(?:\d[ -]*?){13,19}\b/g,
  cpf: /\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2}\b/g,
  phone: /(?:\+?\d{1,3}[\s-]?)?\(?\d{2,3}\)?[\s-]?\d{4,5}[\s-]?\d{4}/g,
};

function maskValue(value: string): string {
  if (value.length <= 4) {
    return "****";
  }
  return value.slice(0, 2) + "****" + value.slice(-2);
}

function applyRedact(text: string, types: PiiType[]): string {
  let result = text;
  for (const type of types) {
    const pattern = new RegExp(patterns[type].source, "g");
    result = result.replace(pattern, `[REDACTED_${type.toUpperCase()}]`);
  }
  return result;
}

function applyMask(text: string, types: PiiType[]): string {
  let result = text;
  for (const type of types) {
    const pattern = new RegExp(patterns[type].source, "g");
    result = result.replace(pattern, (match) => maskValue(match));
  }
  return result;
}

function hasPii(text: string, types: PiiType[]): boolean {
  for (const type of types) {
    const pattern = new RegExp(patterns[type].source, "g");
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

export function piiGuard(options: PiiGuardOptions = {}): HookDefinition {
  const types = options.types ?? (Object.keys(patterns) as PiiType[]);
  const strategy = options.strategy ?? "redact";

  return {
    on: "before:llm",
    handler: async (ctx: unknown): Promise<HookResult> => {
      const context = ctx as { text: string };
      const { text } = context;

      if (strategy === "block") {
        if (hasPii(text, types)) {
          return { block: "PII detected" };
        }
        return undefined;
      }

      if (strategy === "redact") {
        const modified = applyRedact(text, types);
        if (modified !== text) {
          return { modify: { text: modified } };
        }
        return undefined;
      }

      // mask
      const modified = applyMask(text, types);
      if (modified !== text) {
        return { modify: { text: modified } };
      }
      return undefined;
    },
  };
}
