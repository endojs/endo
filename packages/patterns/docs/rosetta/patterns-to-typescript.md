# Relating Endo Patterns to TypeScript Types

TypeScript captures static structure while Endo Patterns and Zod provide runtime validation. This document shows how to author a type declaration that matches a given Pattern or Zod schema. The examples reference [`examples/basic.ts`](./examples/basic.ts) and [`examples/advanced.ts`](./examples/advanced.ts).

| Pattern / Schema | Suggested TypeScript | Notes |
| --- | --- | --- |
| `M.string()` / `z.string()` | `type T = string;` | Strings translate directly. |
| `M.number()` / `z.number().finite()` | `type T = number;` | TypeScript cannot exclude `NaN` or `Infinity` at the type level; rely on runtime validation. |
| `M.bigint()` / `z.bigint()` | `type T = bigint;` | |
| `M.splitRecord({ id: M.nat() }, { note: M.string() })` / `z.object({ id: z.bigint().refine((value) => value >= 0n, 'non-negative bigint'), note: z.string().optional() })` | ```ts
interface RecordShape {
  id: bigint;
  note?: string;
}
``` | TypeScript `bigint` does not encode non-negativity. Convey the constraint in docs or branded types. |
| `M.arrayOf(M.string())` / `z.array(z.string())` | `type T = string[];` | Combine with tuple types if `arrayLengthLimit` is finite. |
| `M.arrayOf(M.string(), harden({ arrayLengthLimit: 2 }))` | `type T = readonly [string?, string?];` | Endo can enforce maximum length at runtime. A tuple with optional slots expresses the same upper bound statically. |
| `M.setOf(M.string())` | `type T = ReadonlyArray<string>;` | TypeScript lacks a native `CopySet`. Express as `ReadonlyArray` with documentation noting deduplication. |
| `M.bagOf(M.string())` | `type T = ReadonlyArray<[string, bigint]>;` | A bag is best expressed as entries with counts. |
| `M.promise()` | `type T = Promise<unknown>;` | Add generics for resolved types if known; runtime checks must ensure the promise is handled according to Endo’s pass-style rules. |
| `M.interface({ getValue: M.callWhen([M.number()], M.number()) })` | ```ts
interface ValueService {
  getValue(input: number): number;
}
``` | TypeScript describes the shape but cannot enforce async/await behaviour. The Endo guard still provides runtime enforcement. |

When a runtime constraint has no native static representation, consider branded types: e.g., `type Nat = bigint & { readonly brand: unique symbol; }`. Guard constructors can cast the value after validation.
