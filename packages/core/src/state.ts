import type { z } from "zod";

type Reducer = (current: unknown, update: unknown) => unknown;

export class StateManager<S extends Record<string, unknown>> {
  private readonly schema: z.ZodType<S>;
  private readonly reducers: Record<string, Reducer>;
  private readonly arrayFields: Set<string>;

  constructor(
    schema: z.ZodType<S>,
    customReducers?: Partial<Record<keyof S, Reducer>>,
  ) {
    this.schema = schema;
    this.reducers = (customReducers ?? {}) as Record<string, Reducer>;
    this.arrayFields = this.detectArrayFields(schema);
  }

  getInitialState(): S {
    return this.schema.parse({}) as S;
  }

  apply(current: S, patch: Partial<S>): S {
    const next = { ...current };

    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;

      if (this.reducers[key]) {
        (next as Record<string, unknown>)[key] = this.reducers[key](
          current[key as keyof S],
          value,
        );
      } else if (
        this.arrayFields.has(key) &&
        Array.isArray(current[key as keyof S])
      ) {
        (next as Record<string, unknown>)[key] = [
          ...(current[key as keyof S] as unknown[]),
          ...(Array.isArray(value) ? value : [value]),
        ];
      } else {
        (next as Record<string, unknown>)[key] = value;
      }
    }

    return next;
  }

  validate(state: unknown): S {
    return this.schema.parse(state);
  }

  freeze(state: S): Readonly<S> {
    return Object.freeze({ ...state });
  }

  private detectArrayFields(schema: z.ZodType): Set<string> {
    const fields = new Set<string>();
    const shape = this.getShape(schema);
    if (shape) {
      for (const [key, fieldSchema] of Object.entries(shape)) {
        if (this.isArraySchema(fieldSchema as z.ZodType)) {
          fields.add(key);
        }
      }
    }
    return fields;
  }

  private getShape(schema: z.ZodType): Record<string, z.ZodType> | null {
    // Zod 4 uses _def.type and _def.shape (not a function)
    const def = (schema as any)._def;
    if (!def) return null;

    if (def.type === "object") {
      const shape = def.shape;
      // In Zod 4, shape may be a plain object (not a function)
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
      return this.getShape(def.innerType as z.ZodType);
    }

    return null;
  }

  private isArraySchema(schema: z.ZodType): boolean {
    const def = (schema as any)._def;
    if (!def) return false;

    if (def.type === "array") return true;

    // Traverse wrapper types (default, optional, etc.)
    if (def.innerType) {
      return this.isArraySchema(def.innerType as z.ZodType);
    }

    return false;
  }
}
