---
'@endo/patterns': minor
---

Add optional `label` parameter to `M.promise()`, aligning its signature
with `M.remotable(label?)`. When a label is provided, runtime error
messages include it for diagnostics (e.g., "Must be a promise Foo, not
remotable").
