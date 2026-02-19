---
'@endo/pass-style': minor
---

- Deprecates `assertChecker`. Use `Fail` in the confirm/reject pattern instead, as supported by `@endo/errors/rejector.js`.
- Enables `passStyleOf` to make errors passable as a side-effect when SES locks down with `hardenTaming` set to `unsafe`, which impacts errors on V8 starting with Node.js 21, and similar engines, that own a `stack` getter and setter that would otherwise be repaired as a side-effect of `harden`.
