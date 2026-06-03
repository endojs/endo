---
'@endo/pass-style': patch
---

Update the `tools/arb-passable` arbitrary for the fast-check 4 API:
`fullUnicodeString()` was removed, so it now uses the documented
equivalent `string({ unit: 'binary' })`. Consumers using this arbitrary
should depend on fast-check 4.

Also pass `noNullPrototype: true` to the record/dictionary arbitraries:
fast-check 4 generates `{__proto__:null}` objects by default, which are
not valid copyRecords (they must inherit from `Object.prototype`), so
without this the arbitrary produced invalid passables.
