# restrict-comparison-operands

> Require both operands of a comparison operator to be compatible types.

**Category:** Possible Errors  
**Requires TypeScript type information:** Yes

## Why this exists

JavaScript's relational operators (`<`, `>`, `<=`, `>=`) silently coerce their operands when the types do not match. Comparing a `number` to a `string` produces surprising results (e.g. `'10' > '9'` is `false`), and comparing to an `object` always coerces through `valueOf`/`toString`, which may be tampered with in a hardened environment.

TypeScript's `strict` mode catches _some_ of these via `strictNullChecks`, but it permits mixed `number`/`string` comparisons because JavaScript does too. This rule goes further: both operands must be the same comparable type (both numeric or both strings) or the comparison is flagged.

## Rule details

### Compatible types

| Left   | Right  | Allowed? |
|--------|--------|----------|
| number | number | ✅        |
| bigint | bigint | ✅        |
| string | string | ✅        |
| number | bigint | ✅ (mixed numerics) |
| bigint | number | ✅ (mixed numerics) |
| number | string | ❌ mismatch |
| any    | number | ❌ unknownType (unless `allowUnknown: true`) |
| object | number | ❌ invalidType |
| enum   | number | ❌ invalidType |

### Incorrect

```ts
declare const a: number;
declare const b: string;
a < b; // ❌ mismatch

declare const c: any;
c > 0; // ❌ unknownType (c could be anything)

declare const obj: object;
obj < 10; // ❌ invalidType
```

### Correct

```ts
declare const x: number;
declare const y: number;
x < y; // ✅

declare const s1: string;
declare const s2: string;
s1 > s2; // ✅

declare const n: number;
declare const b: bigint;
n < b; // ✅ mixed numerics are allowed
```

## Options

```json
{
  "@endo/restrict-comparison-operands": ["error", { "allowUnknown": false }]
}
```

| Option         | Type    | Default | Description                                                  |
|----------------|---------|---------|--------------------------------------------------------------|
| `allowUnknown` | boolean | `false` | When `true`, suppresses the `unknownType` report for `any`-typed operands. |

## When to disable

This rule requires TypeScript type information and a project service. If you are linting plain JavaScript without type information, this rule will silently no-op. It is only useful in `recommended-requiring-type-checking` or `internal` config contexts.
