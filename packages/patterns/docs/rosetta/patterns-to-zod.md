# Mapping Endo Patterns to Zod

This table-driven guide focuses on starting from an Endo Pattern expressed with the `M` helper and finding the most faithful Zod schema. Each entry contains three parts:

1. The Endo Pattern
2. The closest Zod schema (when one exists)
3. Notes describing the quality of the mapping

| Endo Pattern | Zod Schema | Notes |
| --- | --- | --- |
| `M.string()` | `z.string()` | 1:1 translation. Example in [`examples/basic.ts`](./examples/basic.ts). |
| `M.number()` | `z.number()` | 1:1 translation for finite numbers. Zod allows `NaN` by default; use `.finite()` to align with Endo which rejects `NaN` and infinities. |
| `M.bigint()` | `z.bigint()` | 1:1 translation. |
| `M.boolean()` | `z.boolean()` | 1:1 translation. |
| `M.undefined()` | `z.undefined()` | Exact match. |
| `M.null()` | `z.null()` | Exact match. |
| `M.arrayOf(M.string())` | `z.array(z.string())` | Exact match when Element pattern maps cleanly. |
| `M.array(harden({ arrayLengthLimit: 2 }))` | `z.array(z.any()).max(2)` | Zod has upper/lower bounds. Endo can express additional constraints (e.g., pass-by-copy) that Zod cannot. |
| `M.splitRecord({ id: M.nat() }, { note: M.string() })` | `z.object({ id: z.bigint().refine((value) => value >= 0n, 'non-negative bigint') }).extend({ note: z.string().optional() })` | Use `.refine` because BigInt schemas lack `.nonnegative()`. |
| `M.mapOf(M.string(), M.number())` | `z.map(z.string(), z.number())` | Zod only ensures entry types; it does not enforce pass-by-copy vs remotable keys. |
| `M.setOf(M.string())` | *(no direct Zod schema)* | Zod lacks passable `CopySet`. Use `z.array(schema).transform(...)` with deduplication. See [`examples/advanced.ts`](./examples/advanced.ts) and [`gaps-and-workarounds.md`](./gaps-and-workarounds.md#copy-collections). |
| `M.remotable('FlagService')` | `z.object({ getFlag: z.function().args(z.string()).returns(z.union([z.boolean(), z.promise(z.boolean())])) })` | Zod can require a callable property but cannot enforce remotable pass-style. |
| `M.promise()` | `z.custom((value) => value instanceof Promise)` | Zod has no built-in promise schema. A custom refinement approximates the check but loses pass-style information. |
| `M.or(M.string(), M.number())` | `z.union([z.string(), z.number()])` | 1:1 translation. |
| `M.and(M.pattern(), M.array())` | `z.array(z.any()).superRefine(...)` | Zod lacks an intersection helper with structural constraints. A `.superRefine` step can simulate additional predicates. |
| `M.interface('ValueService', { getValue: M.callWhen(M.number()).returns(M.number()) })` | *(no direct Zod schema)* | InterfaceGuards validate remotable behaviour; Zod remains focused on structural data. Pair with documentation or higher-level guards. |

See [`examples/basic.ts`](./examples/basic.ts) and [`examples/advanced.ts`](./examples/advanced.ts) for runnable conversions. The Ava test validates the entries labelled “1:1 translation” and demonstrates the gaps for non-expressible cases.
