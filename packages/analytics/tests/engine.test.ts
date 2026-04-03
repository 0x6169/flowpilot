import { describe, it, expect, beforeEach } from "vitest";
import { AnalyticsEngine } from "../src/engine.js";
import type { AnalyticsEvent } from "../src/types.js";

describe("AnalyticsEngine", () => {
  let engine: AnalyticsEngine;

  // Setup: 3 sessions through "vendas" flow
  // Nodes: saudacao → catalogo → checkout
  // s1: completes all nodes
  // s2: stops at catalogo (enters saudacao and catalogo, never enters checkout)
  // s3: stops at saudacao (enters saudacao only)
  beforeEach(() => {
    engine = new AnalyticsEngine();

    const events: AnalyticsEvent[] = [
      // s1: full journey
      { type: "node:enter", flowName: "vendas", sessionId: "s1", node: "saudacao", timestamp: 1000 },
      { type: "node:exit",  flowName: "vendas", sessionId: "s1", node: "saudacao", timestamp: 1200, duration: 200 },
      { type: "node:enter", flowName: "vendas", sessionId: "s1", node: "catalogo",  timestamp: 1200 },
      { type: "node:exit",  flowName: "vendas", sessionId: "s1", node: "catalogo",  timestamp: 1500, duration: 300 },
      { type: "node:enter", flowName: "vendas", sessionId: "s1", node: "checkout",  timestamp: 1500 },
      { type: "node:exit",  flowName: "vendas", sessionId: "s1", node: "checkout",  timestamp: 1700, duration: 200 },
      { type: "llm:call",   flowName: "vendas", sessionId: "s1", model: "gpt-4",    timestamp: 1100, cost: 0.02 },
      { type: "llm:call",   flowName: "vendas", sessionId: "s1", model: "gpt-3.5",  timestamp: 1300, cost: 0.005 },

      // s2: stops at catalogo
      { type: "node:enter", flowName: "vendas", sessionId: "s2", node: "saudacao", timestamp: 2000 },
      { type: "node:exit",  flowName: "vendas", sessionId: "s2", node: "saudacao", timestamp: 2100, duration: 100 },
      { type: "node:enter", flowName: "vendas", sessionId: "s2", node: "catalogo",  timestamp: 2100 },
      { type: "node:exit",  flowName: "vendas", sessionId: "s2", node: "catalogo",  timestamp: 2500, duration: 400 },
      { type: "llm:call",   flowName: "vendas", sessionId: "s2", model: "gpt-4",    timestamp: 2200, cost: 0.03 },

      // s3: stops at saudacao
      { type: "node:enter", flowName: "vendas", sessionId: "s3", node: "saudacao", timestamp: 3000 },
      { type: "node:exit",  flowName: "vendas", sessionId: "s3", node: "saudacao", timestamp: 3050, duration: 50 },
      { type: "llm:call",   flowName: "vendas", sessionId: "s3", model: "gpt-3.5",  timestamp: 3010, cost: 0.003 },
    ];

    for (const event of events) {
      engine.record(event);
    }
  });

  it("computes funnel with step-by-step reach and dropoff", () => {
    const result = engine.funnel("vendas");

    expect(result.flowName).toBe("vendas");
    expect(result.totalStarted).toBe(3);
    expect(result.totalCompleted).toBe(1);
    expect(result.conversionRate).toBeCloseTo(1 / 3, 5);

    // saudacao: all 3 reached, 1 dropped (s3 never entered catalogo)
    const saudacao = result.steps.find((s) => s.node === "saudacao");
    expect(saudacao).toBeDefined();
    expect(saudacao!.reached).toBe(3);
    expect(saudacao!.dropoff).toBe(1);

    // catalogo: 2 reached (s1, s2), 1 dropped (s2 never entered checkout)
    const catalogo = result.steps.find((s) => s.node === "catalogo");
    expect(catalogo).toBeDefined();
    expect(catalogo!.reached).toBe(2);
    expect(catalogo!.dropoff).toBe(1);

    // checkout: 1 reached, 0 dropped (it's the last node)
    const checkout = result.steps.find((s) => s.node === "checkout");
    expect(checkout).toBeDefined();
    expect(checkout!.reached).toBe(1);
    expect(checkout!.dropoff).toBe(0);
  });

  it("detects bottleneck nodes (catalogo should be #1)", () => {
    const bottlenecks = engine.bottlenecks("vendas");

    expect(bottlenecks.length).toBeGreaterThan(0);
    // catalogo: 2 reached, 1 dropped → dropRate = 0.5
    // saudacao: 3 reached, 1 dropped → dropRate ≈ 0.333
    expect(bottlenecks[0].node).toBe("catalogo");
    expect(bottlenecks[0].dropRate).toBeCloseTo(0.5, 5);
    expect(bottlenecks[0].totalVisits).toBe(2);

    // avgDuration for catalogo: (300 + 400) / 2 = 350
    expect(bottlenecks[0].avgDuration).toBeCloseTo(350, 5);
  });

  it("computes cost breakdown by model", () => {
    const cost = engine.costBreakdown("vendas");

    // gpt-4: 0.02 + 0.03 = 0.05
    expect(cost.byModel["gpt-4"]).toBeCloseTo(0.05, 10);
    // gpt-3.5: 0.005 + 0.003 = 0.008
    expect(cost.byModel["gpt-3.5"]).toBeCloseTo(0.008, 10);
  });

  it("computes average cost per conversation", () => {
    const cost = engine.costBreakdown("vendas");

    // total: 0.02 + 0.005 + 0.03 + 0.003 = 0.058
    expect(cost.totalCost).toBeCloseTo(0.058, 10);
    // 3 unique sessions → avg = 0.058 / 3
    expect(cost.avgPerConversation).toBeCloseTo(0.058 / 3, 10);
  });

  it("returns empty results for unknown flow", () => {
    const funnel = engine.funnel("unknown");
    expect(funnel.steps).toHaveLength(0);
    expect(funnel.totalStarted).toBe(0);
    expect(funnel.totalCompleted).toBe(0);
    expect(funnel.conversionRate).toBe(0);

    const bottlenecks = engine.bottlenecks("unknown");
    expect(bottlenecks).toHaveLength(0);

    const cost = engine.costBreakdown("unknown");
    expect(cost.totalCost).toBe(0);
    expect(cost.avgPerConversation).toBe(0);
    expect(cost.byModel).toEqual({});
  });

  it("counts total events recorded", () => {
    expect(engine.totalEvents()).toBe(16);
  });
});
