import type { z } from "zod";
import type { FlowDefinition, CompiledFlow, EdgeDefinition } from "./types.js";
import { CompileError } from "./errors.js";

type Reducer = (current: unknown, update: unknown) => unknown;

function getShape(schema: z.ZodType): Record<string, z.ZodType> | null {
  const def = (schema as any)._def;
  if (!def) return null;

  if (def.type === "object") {
    const shape = def.shape;
    if (shape && typeof shape === "object" && typeof shape !== "function") {
      return shape as Record<string, z.ZodType>;
    }
    // Fallback: Zod 3 style where shape is a function
    if (typeof shape === "function") {
      return shape() as Record<string, z.ZodType>;
    }
  }

  // Traverse wrapper types (default, optional, etc.)
  if (def.innerType) {
    return getShape(def.innerType as z.ZodType);
  }

  return null;
}

function isArraySchema(schema: z.ZodType): boolean {
  const def = (schema as any)._def;
  if (!def) return false;

  if (def.type === "array") return true;

  // Traverse wrapper types (default, optional, etc.)
  if (def.innerType) {
    return isArraySchema(def.innerType as z.ZodType);
  }

  return false;
}

function buildReducers(
  stateSchema: z.ZodType,
  customReducers?: Partial<Record<string, Reducer>>,
): Record<string, Reducer> {
  const reducers: Record<string, Reducer> = {};

  const shape = getShape(stateSchema);
  if (shape) {
    for (const [key, fieldSchema] of Object.entries(shape)) {
      // Skip if a custom reducer is already provided for this key
      if (customReducers?.[key]) continue;

      if (isArraySchema(fieldSchema as z.ZodType)) {
        reducers[key] = (current: unknown, update: unknown): unknown => {
          const base = Array.isArray(current) ? current : [];
          const additions = Array.isArray(update) ? update : [update];
          return [...base, ...additions];
        };
      }
      // Scalar fields get no auto-reducer
    }
  }

  // Merge in custom reducers (they take precedence)
  if (customReducers) {
    for (const [key, reducer] of Object.entries(customReducers)) {
      if (reducer) {
        reducers[key] = reducer;
      }
    }
  }

  return reducers;
}

export function compile<S extends Record<string, unknown>>(
  definition: FlowDefinition<S>,
): CompiledFlow<S> {
  const { name, nodes, edges, stateSchema, reducers: customReducers } = definition;

  // 1. Validate at least one node exists
  if (nodes.size === 0) {
    throw new CompileError("Flow has no nodes", name);
  }

  // 2. Validate all edges reference existing nodes
  for (const edge of edges) {
    if (!nodes.has(edge.from)) {
      throw new CompileError(
        `Edge references non-existent node: "${edge.from}"`,
        name,
      );
    }
    if (!nodes.has(edge.to)) {
      throw new CompileError(
        `Edge references non-existent node: "${edge.to}"`,
        name,
      );
    }
  }

  // 3. Build edge map (source → edges[])
  const edgeMap = new Map<string, EdgeDefinition[]>();
  for (const edge of edges) {
    const existing = edgeMap.get(edge.from) ?? [];
    existing.push(edge);
    edgeMap.set(edge.from, existing);
  }

  // 4. Detect entry node (first node in the Map)
  const entryNode = nodes.keys().next().value as string;

  // 5. Build auto-reducers from Zod schema
  const reducers = buildReducers(
    stateSchema,
    customReducers as Partial<Record<string, Reducer>> | undefined,
  );

  return {
    name,
    stateSchema,
    nodes,
    edgeMap,
    entryNode,
    reducers,
  };
}
