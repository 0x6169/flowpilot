export interface BudgetConfig {
  maxTokensPerConversation?: number;
  maxCostPerConversation?: number;
}

export interface CompactionConfig {
  microCompactAt?: number;
  fullCompactAt?: number;
  circuitBreakerMax?: number;
}

export interface TokenManagerOptions {
  budget?: BudgetConfig;
  compaction?: CompactionConfig;
  contextWindowSize?: number;
}

export interface TokenManagerStats {
  totalTokens: number;
  totalCost: number;
  currentTokens: number;
  consecutiveFailures: number;
}

export class TokenManager {
  private totalTokens = 0;
  private totalCost = 0;
  private currentTokens = 0;
  private consecutiveFailures = 0;

  private readonly budget: BudgetConfig;
  private readonly compaction: CompactionConfig;
  private readonly contextWindowSize: number;

  constructor(options: TokenManagerOptions = {}) {
    this.budget = options.budget ?? {};
    this.compaction = options.compaction ?? {};
    this.contextWindowSize = options.contextWindowSize ?? 128_000;
  }

  addTokens(count: number): void {
    this.totalTokens += count;
  }

  addCost(amount: number): void {
    this.totalCost += amount;
  }

  setCurrentTokens(tokens: number): void {
    this.currentTokens = tokens;
  }

  isBudgetExceeded(): boolean {
    const max = this.budget.maxTokensPerConversation;
    if (max === undefined) return false;
    return this.totalTokens > max;
  }

  isCostExceeded(): boolean {
    const max = this.budget.maxCostPerConversation;
    if (max === undefined) return false;
    return this.totalCost > max;
  }

  shouldMicroCompact(): boolean {
    const threshold = this.compaction.microCompactAt;
    if (threshold === undefined) return false;
    return this.currentTokens / this.contextWindowSize >= threshold;
  }

  shouldFullCompact(): boolean {
    const threshold = this.compaction.fullCompactAt;
    if (threshold === undefined) return false;
    return this.currentTokens / this.contextWindowSize >= threshold;
  }

  canAttemptCompaction(): boolean {
    const max = this.compaction.circuitBreakerMax;
    if (max === undefined) return true;
    return this.consecutiveFailures < max;
  }

  recordCompactionFailure(): void {
    this.consecutiveFailures += 1;
  }

  recordCompactionSuccess(): void {
    this.consecutiveFailures = 0;
  }

  getStats(): TokenManagerStats {
    return {
      totalTokens: this.totalTokens,
      totalCost: this.totalCost,
      currentTokens: this.currentTokens,
      consecutiveFailures: this.consecutiveFailures,
    };
  }
}
