type PromptLayer = string | ((ctx: Record<string, unknown>) => string) | undefined;

interface PromptLayers {
  global?: string;
  flow?: PromptLayer;
  node?: PromptLayer;
  dynamic?: Record<string, unknown>;
}

export class SystemPromptBuilder {
  private readonly layers: PromptLayers;
  private memoizedStatic: string | null = null;

  constructor(layers: PromptLayers) {
    this.layers = layers;
  }

  build(ctx?: Record<string, unknown>): string {
    const parts: string[] = [];

    if (this.layers.global) {
      parts.push(this.layers.global);
    }

    if (this.layers.flow) {
      if (typeof this.layers.flow === "function") {
        parts.push(this.layers.flow(ctx ?? {}));
      } else {
        parts.push(this.layers.flow);
      }
    }

    if (this.layers.node) {
      if (typeof this.layers.node === "function") {
        parts.push(this.layers.node(ctx ?? {}));
      } else {
        parts.push(this.layers.node);
      }
    }

    if (this.layers.dynamic && Object.keys(this.layers.dynamic).length > 0) {
      const dynamicLines = Object.entries(this.layers.dynamic)
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join("\n");
      parts.push(`[Context]\n${dynamicLines}`);
    }

    return parts.filter(Boolean).join("\n\n");
  }

  getStaticPart(): string {
    if (this.memoizedStatic !== null) return this.memoizedStatic;
    const parts: string[] = [];
    if (this.layers.global) parts.push(this.layers.global);
    if (typeof this.layers.flow === "string") parts.push(this.layers.flow);
    this.memoizedStatic = parts.join("\n\n");
    return this.memoizedStatic;
  }
}
