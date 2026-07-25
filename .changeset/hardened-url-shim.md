---
'ses': minor
---

Permit `URL` and `URLSearchParams` as tamed intrinsics.

`URLSearchParams` is a pure, powerless data structure and is now permitted on
every compartment (start compartment and every compartment created after
lockdown, identity-equal). Its hidden iterator prototype — reachable only as
`Object.getPrototypeOf(new URLSearchParams().entries())` — is sampled and
frozen alongside the other primordials, so a compartment holding a single
`URLSearchParams` can no longer mutate the iterator prototype and influence
every other compartment's iteration.

`URL` takes the `Date`-style split. The start compartment keeps the host's
full `URL`, including the ambient `createObjectURL` and `revokeObjectURL`
blob-registry methods, which a host application may legitimately need. Every
compartment created after lockdown instead receives a tamed `URL` that omits
those two methods, so a shared compartment cannot mint or revoke blob URLs.
The powered and tamed constructors share one `URL.prototype`, so an instance
constructed on either side satisfies `instanceof URL` on the other.

A new lockdown option collapses the split for embeddings that have no use for
blob URLs even on the start compartment:

```js
lockdown({ urlBlobMethods: 'remove' }); // default: 'keepOnInitialGlobal'
```

With `urlBlobMethods: 'remove'`, `createObjectURL` and `revokeObjectURL` are
removed everywhere and the start compartment and every shared compartment
share a single tamed `URL` binding.

On hosts that do not provide `URL` or `URLSearchParams` (notably XS), lockdown
proceeds without them and compartments observe their absence exactly as
before.

Code that monkey-patches `URL.prototype` or `URLSearchParams.prototype` after
`lockdown()` will now throw, because the prototypes are frozen. Such mutations
must happen before lockdown, the same rule that already applies to every other
intrinsic. Code that relies on `URL.createObjectURL` inside a compartment must
obtain the method from the host before lockdown and endow it deliberately;
moving that ambient authority behind an explicit capability is the point of
the taming.
