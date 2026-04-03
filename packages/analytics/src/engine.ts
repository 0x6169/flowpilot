import type {
  AnalyticsEvent,
  FunnelResult,
  FunnelStep,
  BottleneckResult,
  CostBreakdown,
} from "./types.js";

export class AnalyticsEngine {
  private events: AnalyticsEvent[] = [];

  record(event: AnalyticsEvent): void {
    this.events.push(event);
  }

  totalEvents(): number {
    return this.events.length;
  }

  funnel(flowName: string): FunnelResult {
    const flowEvents = this.events.filter((e) => e.flowName === flowName);

    if (flowEvents.length === 0) {
      return {
        flowName,
        steps: [],
        conversionRate: 0,
        totalStarted: 0,
        totalCompleted: 0,
      };
    }

    // Collect all node:enter events grouped by session
    const enterEvents = flowEvents.filter((e) => e.type === "node:enter" && e.node != null);

    // Determine ordered list of nodes by first appearance across all sessions
    const nodeOrder: string[] = [];
    const nodeSet = new Set<string>();
    for (const e of enterEvents) {
      const node = e.node as string;
      if (!nodeSet.has(node)) {
        nodeSet.add(node);
        nodeOrder.push(node);
      }
    }

    // Count how many unique sessions reached each node
    const sessionsByNode = new Map<string, Set<string>>();
    for (const node of nodeOrder) {
      sessionsByNode.set(node, new Set());
    }
    for (const e of enterEvents) {
      const node = e.node as string;
      sessionsByNode.get(node)!.add(e.sessionId);
    }

    const totalStarted = sessionsByNode.get(nodeOrder[0])?.size ?? 0;
    const lastNode = nodeOrder[nodeOrder.length - 1];
    const totalCompleted = sessionsByNode.get(lastNode)?.size ?? 0;
    const conversionRate = totalStarted === 0 ? 0 : totalCompleted / totalStarted;

    // Build funnel steps: dropoff = sessions that reached this node but NOT the next
    const steps: FunnelStep[] = nodeOrder.map((node, idx) => {
      const reached = sessionsByNode.get(node)!.size;
      const nextNode = nodeOrder[idx + 1];
      const nextReached = nextNode ? (sessionsByNode.get(nextNode)?.size ?? 0) : reached;
      const dropoff = reached - nextReached;
      return { node, reached, dropoff };
    });

    return { flowName, steps, conversionRate, totalStarted, totalCompleted };
  }

  bottlenecks(flowName: string): BottleneckResult[] {
    const funnelResult = this.funnel(flowName);

    if (funnelResult.steps.length === 0) {
      return [];
    }

    // Compute avgDuration for each node from node:exit events
    const exitEvents = this.events.filter(
      (e) => e.flowName === flowName && e.type === "node:exit" && e.node != null && e.duration != null
    );

    const durationsByNode = new Map<string, number[]>();
    for (const e of exitEvents) {
      const node = e.node as string;
      if (!durationsByNode.has(node)) {
        durationsByNode.set(node, []);
      }
      durationsByNode.get(node)!.push(e.duration as number);
    }

    const results: BottleneckResult[] = funnelResult.steps.map((step) => {
      const dropRate = step.reached === 0 ? 0 : step.dropoff / step.reached;
      const durations = durationsByNode.get(step.node) ?? [];
      const avgDuration =
        durations.length === 0
          ? 0
          : durations.reduce((sum, d) => sum + d, 0) / durations.length;
      return {
        node: step.node,
        dropRate,
        avgDuration,
        totalVisits: step.reached,
      };
    });

    // Sort by dropRate descending
    results.sort((a, b) => b.dropRate - a.dropRate);

    return results;
  }

  costBreakdown(flowName: string): CostBreakdown {
    const llmEvents = this.events.filter(
      (e) => e.flowName === flowName && e.type === "llm:call" && e.cost != null
    );

    if (llmEvents.length === 0) {
      return { totalCost: 0, avgPerConversation: 0, byModel: {} };
    }

    const byModel: Record<string, number> = {};
    let totalCost = 0;

    for (const e of llmEvents) {
      const cost = e.cost as number;
      totalCost += cost;
      if (e.model != null) {
        const model = e.model as string;
        byModel[model] = (byModel[model] ?? 0) + cost;
      }
    }

    // Count unique sessions that had llm:call events for this flow
    const uniqueSessions = new Set(llmEvents.map((e) => e.sessionId));
    const avgPerConversation = uniqueSessions.size === 0 ? 0 : totalCost / uniqueSessions.size;

    return { totalCost, avgPerConversation, byModel };
  }
}
