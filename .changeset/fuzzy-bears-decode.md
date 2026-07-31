---
'@endo/marshal': major
---

`makeMarshal().fromCapData` and its deprecated `.unserialize` alias now return `unknown` instead of `any`, while `parse` now returns `unknown` instead of `Passable`; TypeScript consumers must narrow or refine decoded roots and should prefer `fromCapData` over the deprecated alias.
