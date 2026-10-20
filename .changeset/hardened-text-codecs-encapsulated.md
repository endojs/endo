---
'ses': patch
---

`lockdown()` now replaces affected host `TextEncoder` and `TextDecoder`
constructors with SES-owned constructors that delegate construction to the
captured host originals and share the host prototypes.

On Chromium before version 138, the WebIDL codec constructors carry own
legacy restricted properties — `caller` and `arguments`, each
`{ value: null, writable: false, configurable: false }` — which `lockdown()`
can neither delete nor repair in place, so `lockdown()` failed on those
engines once ses 2.3.0 permitted the codecs
(https://github.com/endojs/endo/issues/3369). That descriptor shape is
indistinguishable from the live `caller` and `arguments` slots of a sloppy
function, so neither tolerating nor permitting it would be safe. Instead, the
when either codec constructor has the affected `arguments` descriptor, its
permitted intrinsic is now SES-owned and the host constructor object,
restricted properties and all, never enters the permitted intrinsics graph.
Engines without the affected descriptor retain their original constructors.

Instances are constructed by the captured host constructors and the
prototypes are the host prototypes, so `instanceof`, subclassing,
`encode`, `encodeInto`, streaming `decode`, decoder labels and options, and
the `encoding`, `fatal`, and `ignoreBOM` getters all retain host behavior.
On affected engines, the post-lockdown `TextEncoder` and `TextDecoder` are not
identical to the host constructors captured before `lockdown()`.
