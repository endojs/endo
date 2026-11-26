---
'ses': patch
---

Fixed `lockdown()` to no longer emit spurious `intrinsics` warnings when auditing the WHATWG `URL` / `URLSearchParams` family of globals on Node.js — both the blob-registry statics' undeletable `.prototype` and the non-standard `nodejs.util.inspect.custom` symbol on the URL-family prototypes.
No behavior change — the lockdown report is simply quieter and remains fully accurate.
