---
'ses': minor
---

`overrideTaming: 'moderate'` includes `overrideTaming: 'min'`.

Previously `overrideTaming: 'min'` correctly enabled `Iterator.prototype.constructor` to be overridden by assignment, but due to an oversight, `overrideTaming: 'moderate'` did not. Now it does.

To make such mistakes less likely, this PR also adopts a style where all records within larger enablements triple-dot the corresponding record from a smaller enablement, if present.
