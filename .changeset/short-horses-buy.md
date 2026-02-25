---
'@endo/patterns': patch
---

- `containerHasSplit` now hardens its output(s) when working with copyArrays,
  ensuring that each output is itself a copyArray instance.
