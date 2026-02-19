---
'ses': minor
---

- Adds `assert.makeError` and deprecates `assert.error` as an alias, matching
  the API already exported from `@endo/errors`.
- Before this version, the `assert` left in global scope before `lockdown`
  would redact errors and would be replaced by `lockdown` with a version that
  did _not_ redact errors if the caller opted-in with `errorTaming`
  set to one of the `unsafe` variants.
  After this version, the reverse is true: the `assert` left in global scope
  before `lockdown` does not redact.
  Then, `lockdown` replaces `assert` with a redacting `assert` unless the
  caller opted-out with `errorTaming` set to one of the `unsafe` variants.
