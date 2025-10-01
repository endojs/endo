# Gaps and Work-arounds

Some Endo Pattern features have no direct equivalent in Zod or TypeScript. This document highlights the most important gaps and suggests practical mitigations. See [`examples/advanced.ts`](./examples/advanced.ts) for code that exercises each scenario, together with [`../../test/rosetta/examples.test.js`](../../test/rosetta/examples.test.js).

## Pass Styles

Endo Patterns rely on pass-style metadata (e.g., `remotable`, `promise`) to differentiate between values that would otherwise look identical to structured-clone-based checkers. Zod and TypeScript do not carry pass-style information. Recommended practice:

- Use `M.remotable()` / `M.interface()` for runtime enforcement.
- Document the remotable contract and expose TypeScript interfaces for call signatures.
- In Zod, combine `z.any()` with `.refine(isRemotable, 'remotable expected')` where `isRemotable` delegates to `@endo/pass-style` checks.

## Copy Collections

Zod does not currently expose dedicated schema helpers for CopySet, CopyBag, or CopyMap. Suggested work-arounds:

- CopySet: validate with `z.array(schema)` and `.superRefine()` to ensure uniqueness, then coerce to `CopySet` in application code.
- CopyBag: validate with `z.array(z.tuple([schema, z.bigint().nonnegative()]))`.
- CopyMap: use `z.array(z.tuple([keySchema, valueSchema]))` when ordered entries are acceptable, or a custom validator wrapping `M.copyMapOf()`.

TypeScript can express these shapes using readonly arrays of tuples. The runtime guard remains authoritative.

## Promise Turnstyle

`M.promise()` distinguishes fulfilled vs. unresolved promises via pass-style, but Zod only sees "any object with a `then` method". When you need promise-aware checks:

1. Use Endo Pattern validation first.
2. In Zod, wrap the value in `z.custom()` and delegate to `passStyleOf(value) === 'promise'`.
3. Re-document that TypeScript types (`PromiseLike<unknown>`) do not catch handled vs unhandled promise differences.

## Branded Naturals

`M.nat()` guarantees non-negative bigints. TypeScript cannot encode this constraint. Introduce a branded type:

```ts
// docs/rosetta/examples/nat-brand.ts (conceptual)
export type Nat = bigint & { readonly __kind: 'Nat' };
```

Provide a guard function that runs `mustMatch(n, M.nat())` before returning `n as Nat`.

## Interface Guards

Endo InterfaceGuards (e.g., `M.interface`) validate method availability, argument patterns, and eventual-send behaviour. Zod has no equivalent concept. Model your service API as a TypeScript interface and use the guard to ensure remote callers respect the contract at runtime.

## SES & Hardened Data

Endo assumes harden()ed pass-by-copy data. Zod cannot enforce hardening. For cross-tooling compatibility:

- Harden specimens before validation in example code.
- In Zod, use `.transform(value => harden(value))` when safe.
- Document that TypeScript types describe structure only; the caller must still freeze the data.

These patterns give authors the vocabulary to explain when conversions stop being lossless. LLMs can rely on this page to decide whether to fall back to higher-level guards, branded types, or documentation notes.
