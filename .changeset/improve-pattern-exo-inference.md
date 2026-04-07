---
'@endo/patterns': minor
'@endo/exo': minor
'@endo/pass-style': minor
---

Improve TypeScript inference for patterns, exo, and pass-style. These are compile-time type changes only; no runtime behavior changes.

- **pass-style**: `CopyArray<T>` is now `readonly T[]` so readonly tuples (e.g. `readonly ['ibc']`) satisfy `Passable`. Backward-compatible because `T[]` still extends `readonly T[]`.
- **patterns**: `M.remotable()` defaults to `any` (matching `M.promise()`), so unparameterized remotables are assignable to concrete remotable typedefs. The parameterized form `M.remotable<typeof SomeInterfaceGuard>()` still yields precise inference.
- **patterns**: `TFRemotable` returns `any` (not `Payload`) for non-`InterfaceGuard` arguments.
- **patterns**: `TFOr` handles array-of-patterns and falls back through `TFAnd`; `M.undefined()` maps to `void`.
- **patterns**: `TFOptionalTuple` emits truly optional elements; `M.promise()` maps to `PromiseLike`.
- **patterns**: `TFSplitRecord` handles the empty-rest case correctly.
- **patterns**: `TFRestArgs` unwraps array patterns.
- **patterns**: `TypeFromArgGuard` discriminates by `toStringTag`, not structural shape.
- **patterns**: `MatcherOf` payload is preserved through `InterfaceGuard`.
- **patterns**: new `CastedPattern<T>` for unchecked type assertions in pattern position.
- **exo**: `defineExoClass`, `defineExoClassKit`, and `makeExo` no longer intersect facet constraints with `& Methods`. The previous constraint collapsed specific facet keys into the `string | number | symbol` index signature, making `FilteredKeys` return `never` and erasing facet method inference (`Pick<X, never> = {}`).
- **exo**: `Guarded<M, G>` is now structurally compatible across `G`, and the kit `F` constraint is widened.
- **exo**: `defineExoClassKit` preserves facet inference when no guard is supplied.

TypeScript consumers that were working around the previous inference gaps with casts may be able to remove those casts. Downstream code that depended on the narrower `CopyArray<T> = T[]` or the previous `M.remotable()` default may need minor adjustments.
