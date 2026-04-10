---
'@endo/patterns': minor
'@endo/exo': minor
---

feat: infer TypeScript types from pattern guards

- `TypeFromPattern<P>` — infer static types from any pattern matcher
- `TypeFromMethodGuard<G>` — infer function signatures from `M.call()` / `M.callWhen()` guards
- `TypeFromInterfaceGuard<G>` — infer method records from interface guard definitions
- `M.remotable<typeof Guard>()` — facet-isolated return types in exo kits
- `M.infer<typeof pattern>` — namespace shorthand analogous to `z.infer`
- `matches` and `mustMatch` now narrow the specimen type via type predicates
- `makeExo`, `defineExoClass`, and `defineExoClassKit` enforce method signatures against guards at compile time

These are compile-time type changes only; there are no runtime behavioral changes.
Existing TypeScript consumers may see new type errors where method signatures diverge from their guards.
