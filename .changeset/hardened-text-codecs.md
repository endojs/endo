---
'ses': minor
---

Permit `TextEncoder` and `TextDecoder` as universal intrinsics.

`TextEncoder` and `TextDecoder` are pure transformations between `string` and
`Uint8Array` with no static side channels, so they are now permitted on every
compartment (start compartment and every compartment created after lockdown,
identity-equal). Their prototypes are frozen alongside the other tamed
primordials. On hosts that do not provide them (XS), lockdown proceeds without
them and compartments observe their absence as before.

Code that monkey-patches `TextEncoder.prototype` or `TextDecoder.prototype`
after `lockdown()` will now throw, because the prototypes are frozen. Such
mutations must happen before lockdown, the same rule that already applies to
every other intrinsic.
