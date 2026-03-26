---
'@endo/eventual-send': minor
'@endo/patterns': minor
'@endo/exo': patch
---

Add build infrastructure for `.ts` source modules using erasable type syntax.
Migrate `E.js` to `E.ts` in `@endo/eventual-send` and `patternMatchers.js` to
`patternMatchers.ts` in `@endo/patterns`. Published artifacts remain `.js` —
types are erased at pack time, so consumers see no change.
