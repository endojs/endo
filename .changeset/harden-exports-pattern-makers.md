---
'@endo/eslint-plugin': minor
---

The `@endo/harden-exports` rule now skips named exports whose initializer is
a Pattern maker call of the form `M.something(...)`.
Pattern makers return values that are already hardened, so a follow-up
`harden(name)` after their export is redundant noise.

A new companion rule, `@endo/no-harden-pattern-maker`, surfaces existing
sites where code over-hardens a Pattern maker result.
The rule fires on both `harden(M.string())` and the indirect form
`const x = M.string(); harden(x);`, and is included in the recommended
configuration as a warning so existing code doesn't break loudly while
the redundant calls are cleaned up.
