export interface FunnelStep {
  node: string;
  reached: number;
  dropoff: number;
}

export interface FunnelResult {
  flowName: string;
  steps: FunnelStep[];
  conversionRate: number;
  totalStarted: number;
  totalCompleted: number;
}

export interface BottleneckResult {
  node: string;
  dropRate: number;
  avgDuration: number;
  totalVisits: number;
}

export interface CostBreakdown {
  totalCost: number;
  avgPerConversation: number;
  byModel: Record<string, number>;
}

export interface AnalyticsEvent {
  type: string;
  flowName: string;
  sessionId: string;
  node?: string;
  timestamp: number;
  duration?: number;
  model?: string;
  tokens?: number;
  cost?: number;
  [key: string]: unknown;
}
