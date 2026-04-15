---
'@endo/pass-style': minor
---

Unblock TypeScript declaration emit in downstream packages that structurally expose `PassStyled`/`Container` types. Compile-time type changes only; no runtime behavior changes.

- `PASS_STYLE` is now typed as the string-literal `'Symbol(passStyle)'` rather than `unique symbol`. The runtime value is unchanged (still `Symbol.for('passStyle')`), and computed-key indexing like `obj[PASS_STYLE]` continues to work because JS computed keys accept any value. This removes TS4023 / TS9006 errors in consumers whose inferred types structurally contain `[PASS_STYLE]` (via `PassStyled`, `ExtractStyle`, object spread of a `PassStyled`, etc.). A `unique symbol` is only nameable via its original declaration module, which consumers have no reason to import; a string-literal type has no such nameability requirement.
- `CopyArrayInterface`, `CopyRecordInterface`, and `CopyTaggedInterface` are now exported, so downstream `.d.ts` emit can name them when they appear through structural expansion of `Passable`/`Container`.
- The `PassStyleOf` array overload is widened from `(p: any[]) => 'copyArray'` to `(p: readonly any[]) => 'copyArray'`, so `as const` tuples and `readonly T[]` values classify as `'copyArray'`. This aligns the classifier with `CopyArray<T>`, which is already `readonly T[]`. Backward-compatible because `T[]` still extends `readonly T[]`.

Obviates the `@endo/pass-style` patch that agoric-sdk has been carrying in `.yarn/patches/`.

TypeScript consumers that relied on `typeof PASS_STYLE` being `unique symbol` (e.g. annotating a value as `symbol` from `PASS_STYLE`) will need minor adjustments — widen the annotation to `symbol | string`, or cast via `unknown`.
