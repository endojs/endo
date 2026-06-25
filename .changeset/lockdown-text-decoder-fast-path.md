---
'@endo/lockdown': patch
---

Fix `TypeError: Cannot assign to read only property 'Symbol(kUTF8FastPath)'`
(and the analogous `kWindows1252FastPath` variant) when calling `decode()` on a
hardened `TextDecoder` instance under recent Node.js releases.

Node stores per-instance "fast path" flags as own data properties keyed by
internal symbols and mutates them on every `decode()` call. Once the instance
was hardened the flags became non-writable and the next `decode()` threw. The
post-lockdown setup now wraps `globalThis.TextDecoder` so that the affected
flags are exposed via accessor properties on `TextDecoder.prototype`, backed by
a `WeakMap`. The accessor only honors writes that lower the flag, matching
Node's own one-way `&&=` semantics, and so does not introduce a covert channel
beyond the one already observable on an unhardened instance. See
https://github.com/endojs/endo/issues/2813.
