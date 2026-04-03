import type { HookDefinition, HookEvent, HookResult } from "../types.js";

export class HookRunner {
  private readonly hooks: HookDefinition[];

  constructor(hooks: HookDefinition[]) {
    this.hooks = hooks;
  }

  async run(event: HookEvent, context: unknown): Promise<HookResult> {
    const matching = this.hooks.filter((h) => h.on === event);
    let lastModify: HookResult = undefined;
    for (const hook of matching) {
      try {
        const result = await hook.handler(context);
        if (result && typeof result === "object") {
          if ("block" in result) return result;
          if ("redirect" in result) return result;
          if ("modify" in result) lastModify = result;
        }
      } catch { /* error-isolated */ }
    }
    return lastModify;
  }

  merge(additional: HookDefinition[]): HookRunner {
    return new HookRunner([...this.hooks, ...additional]);
  }
}
