# Mapping Zod Schemas to Endo Patterns

When you begin from Zod, the goal is to locate the closest Endo Pattern and understand whether the conversion is exact or if additional guards are required. This guide mirrors [`patterns-to-zod.md`](./patterns-to-zod.md) but starts from the Zod surface area most commonly produced by LLMs.

| Zod Schema | Endo Pattern | Conversion Quality | Notes |
| --- | --- | --- | --- |
| `z.string()` | `M.string()` | Exact | Both enforce JavaScript strings. |
| `z.number().finite()` | `M.number()` | Exact | Endo rejects `NaN` and infinite values, so `.finite()` is required on the Zod side to avoid mismatches. |
| `z.bigint()` | `M.bigint()` | Exact | |
| `z.boolean()` | `M.boolean()` | Exact | |
| `z.literal('ready')` | `'ready'` | Exact | Literal patterns are the literal passable themselves. |
| `z.union([z.string(), z.number()])` | `M.or(M.string(), M.number())` | Exact | Endo preserves tagged error messages for each option. |
| `z.intersection(z.object({ id: z.string() }), z.object({ label: z.string() }))` | `M.splitRecord({ id: M.string(), label: M.string() })` | Better | Intersections of `z.object` can be represented with `M.splitRecord`; keep optional properties in the second argument. |
| `z.array(z.string()).min(1).max(3)` | `M.arrayOf(M.string(), harden({ arrayLengthLimit: 3 }))` + manual length check | Partial | Endo exposes upper limit, but `.min()` requires an extra `specimen.length >= 1` assertion before calling `mustMatch`. |
| `z.map(z.string(), z.number())` | `M.mapOf(M.string(), M.number())` | Partial | Endo enforces copy-map semantics; Zod only inspects entries. |
| `z.record(z.string())` | `M.splitRecord({}, { [M.symbol()] : ??? })` | Not directly expressible | Endo Patterns require property names to be known or pattern-matched via `M.guard`. Prefer rephrasing with `CopyMap`. |
| `z.object({ meta: z.any().optional() }).passthrough()` | *(no Endo Pattern)* | Not supported | Endo forbids extra properties unless they are described. Use `M.splitRecord` and explicit optional entries. |
| `z.custom((value) => value instanceof Promise, { message: 'Promise' })` | `M.promise()` | Partial | Endo distinguishes handled/unhandled Promise pass-styles. Zod custom checks cannot reach pass-style metadata. |

For Zod declarations with no Endo equivalent, see [`gaps-and-workarounds.md`](./gaps-and-workarounds.md) for defensive fallback strategies.
