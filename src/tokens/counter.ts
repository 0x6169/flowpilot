import type { TokenUsage } from "../types.js";

export interface TokenCounterOptions {
  contextWindowSize?: number;
}

export interface CostRates {
  inputCostPer1M: number;
  outputCostPer1M: number;
}

export interface Message {
  role: string;
  content: string;
}

export class TokenCounter {
  private _totalUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
  private _currentContextTokens = 0;
  private readonly contextWindowSize: number;

  constructor(options: TokenCounterOptions = {}) {
    this.contextWindowSize = options.contextWindowSize ?? 128_000;
  }

  estimate(text: string): number {
    return Math.ceil(text.length / 4);
  }

  estimateMessages(messages: Message[]): number {
    return messages.reduce((sum, msg) => sum + this.estimate(msg.content), 0);
  }

  addUsage(usage: TokenUsage): void {
    this._totalUsage.inputTokens += usage.inputTokens;
    this._totalUsage.outputTokens += usage.outputTokens;
    this._totalUsage.totalTokens += usage.totalTokens;
  }

  get totalUsage(): Readonly<TokenUsage> {
    return { ...this._totalUsage };
  }

  estimateCost(rates: CostRates): number {
    const inputCost = (this._totalUsage.inputTokens / 1_000_000) * rates.inputCostPer1M;
    const outputCost = (this._totalUsage.outputTokens / 1_000_000) * rates.outputCostPer1M;
    return inputCost + outputCost;
  }

  setCurrentContextTokens(tokens: number): void {
    this._currentContextTokens = tokens;
  }

  contextUsagePercent(): number {
    return (this._currentContextTokens / this.contextWindowSize) * 100;
  }
}
