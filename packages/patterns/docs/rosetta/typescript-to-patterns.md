# Mapping TypeScript Declarations to Endo Patterns

When you begin with a TypeScript type and need the corresponding runtime guard, use this table to find the closest Endo Pattern (or guard) and any extra checks required. Examples come from [`examples/basic.ts`](./examples/basic.ts) and [`examples/advanced.ts`](./examples/advanced.ts).

| TypeScript | Endo Pattern | Notes |
| --- | --- | --- |
| `type Name = string;` | `M.string()` | Direct translation. |
| `type Count = number;` | `M.number()` | Add runtime checks to reject `NaN`/`Infinity`. |
| `type Amount = bigint;` | `M.bigint()` | |
| ```ts
interface UserProfile {
  id: bigint;
  handle: string;
  email?: string;
  note?: string;
}
``` | `M.splitRecord({ id: M.nat(), handle: M.string() }, { email: M.string(), note: M.string() })` | Endo enforces the `M.nat()` constraint and forbids undeclared properties. |
| `type Tags = string[];` | `M.arrayOf(M.string())` | Harden arrays before validation to meet pass-by-copy expectations. |
| `type Pair = readonly [string, number];` | `harden([M.string(), M.number()])` | Tuples become hardened arrays of element patterns. |
| ```ts
interface FeatureFlags {
  readonly flags: readonly string[];
}
``` | `M.splitRecord({ flags: M.arrayOf(M.string()) })` | To enforce uniqueness, compose with `mustMatch` and a custom predicate or use `M.and`. |
| ```ts
interface RemoteService {
  getFlag(name: string): boolean | Promise<boolean>;
}
``` | `M.interface('FlagService', harden({ getFlag: M.callWhen(M.string()).returns(M.boolean()) }))` | InterfaceGuards ensure remotable behaviour; TypeScript cannot express pass-style. |
| `type KnownPromise<T> = Promise<T>;` | `M.promise()` | Distinguish from plain thenables; Endo checks pass-style. |
| `type Nat = bigint & { readonly __brand: 'Nat' };` | Guard constructor: `spec => (mustMatch(spec, M.nat()), spec as Nat)` | Branded types need runtime validation to enforce structural promises. |

If a TypeScript type uses index signatures (`Record<string, T>`) or structural openness (e.g., `interface Foo { [key: string]: string }`), prefer translating it to CopyMap patterns (`M.mapOf`) or document the mismatch explicitly. See [`gaps-and-workarounds.md`](./gaps-and-workarounds.md) for more guidance.
