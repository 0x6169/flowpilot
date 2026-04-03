export interface ResultLimiterOptions {
  maxCharsPerTool: number;
  maxCharsPerTurn?: number;
  truncationMessage?: string;
}

export interface LimitResult {
  text: string;
  truncated: boolean;
}

export class ResultLimiter {
  private readonly maxCharsPerTool: number;
  private readonly maxCharsPerTurn: number | undefined;
  private readonly truncationMessage: string;
  private turnCharsUsed = 0;

  constructor(options: ResultLimiterOptions) {
    this.maxCharsPerTool = options.maxCharsPerTool;
    this.maxCharsPerTurn = options.maxCharsPerTurn;
    this.truncationMessage = options.truncationMessage ?? "[truncated]";
  }

  limit(text: string): LimitResult {
    let truncated = false;
    let result = text;

    // Check per-tool limit
    if (result.length > this.maxCharsPerTool) {
      result = result.slice(0, this.maxCharsPerTool) + this.truncationMessage;
      truncated = true;
    }

    // Check per-turn limit
    if (this.maxCharsPerTurn !== undefined) {
      const remaining = this.maxCharsPerTurn - this.turnCharsUsed;
      if (remaining <= 0) {
        result = this.truncationMessage;
        truncated = true;
        this.turnCharsUsed = this.maxCharsPerTurn;
      } else if (result.length > remaining) {
        result = result.slice(0, remaining) + this.truncationMessage;
        truncated = true;
        this.turnCharsUsed = this.maxCharsPerTurn;
      } else {
        this.turnCharsUsed += result.length;
      }
    }

    return { text: result, truncated };
  }

  resetTurn(): void {
    this.turnCharsUsed = 0;
  }
}
