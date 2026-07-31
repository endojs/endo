---
'@endo/marshal': major
'@endo/captp': patch
---

`makeMarshal().fromCapData` and its deprecated `.unserialize` alias now return `unknown` instead of `any`, while `parse` now returns `unknown` instead of `Passable`; TypeScript consumers must narrow or refine decoded roots and should prefer `fromCapData` over the deprecated alias.
`@endo/captp` now rejects malformed decoded call and trap-iterator method payloads, disconnecting the connection to discard imported slots and in-flight trap state; valid CapTP messages remain unchanged.
