---
'@endo/patterns': patch
'@endo/exo': patch
---

Repair inferred collection types for parameterized and unparameterized pattern
matchers, including clean defaults for `arrayOf`, `recordOf`, `mapOf`, `setOf`,
`bagOf`, and `tagged`.

Preserve nested `splitRecord` pattern literals while validating their values as
Patterns, model optional method arguments with optional tuple elements, and make
bare `.returns()` describe `void` and async `Promise<void>` contracts.
