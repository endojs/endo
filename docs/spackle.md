---
title: spackle
group: Documents
category: Guides
author: Kris Kowal
date: 2026-05-21
---

Kris Kowal, 2026-05-21

# Spackle

A *spackle* module races to install a behavior on a shared intrinsic at a
registered symbol, and exports an ergonomic function that calls through to the
installed behavior.
The first instance to load wins the race; later instances find the property
defined and adopt it instead of installing their own.
Spackle combines a polyfill (installs on a shared intrinsic) with a ponyfill
(an ergonomic import) and a race discipline (first writer wins, mediated by a
registered symbol).

## Eval twins

A piece of code that gets instantiated more than once in a realm has *eval
twins*.
Eval twins of unique symbols are not equal, eval twins of private class fields
do not recognize each other, and `instanceof` does not work across eval twins
of the same class.
Eval twins of registered symbols, however, are equal.
A library whose eval twins must agree on shared state, not merely on
structure or convention, needs a coordination mechanism that survives this
duplication.

The promise ecosystem converged on `then` methods because two copies of the
same Promise library could not otherwise recognize each other's instances.
Spackle generalizes that lesson: when a library needs realm-wide identity for
something on a shared intrinsic, it can use a registered symbol as the rendezvous
point and ergonomic exports as the calling convention.

## Shim, polyfill, ponyfill, spackle

A *shim* or *polyfill* is JavaScript that runs early to modify the global
environment so it more closely resembles a later standard.
Remy Sharp coined "polyfill" in [*What is a Polyfill?*](https://remysharp.com/2010/10/08/what-is-a-polyfill)
(2010), drawing on the British brand name *Polyfilla* for spackling paste.
"Shim" has older and less attributable use, predating its JavaScript
application as a general term in systems software for a thin compatibility
layer interposed between a caller and a changed interface.

A polyfill that anticipates a future standard should not overwrite a native
implementation that may already be present, in case the native behavior differs
from the shim:

```js
if (!Array.prototype.map) {
  Array.prototype.map = function () {
    // ...
  };
}
```

Unconditional overwrite risks composition hazards with other polyfills;
conditional install risks behavior drift when the native implementation lands
or differs.

A *ponyfill* is a function exported from a module that falls through to the
native behavior when present and provides a user-code fallback when not.
Sindre Sorhus coined "ponyfill" alongside the [`object-assign`](https://github.com/sindresorhus/object-assign)
package (2014) and later collected the convention at
[sindresorhus/ponyfill](https://github.com/sindresorhus/ponyfill).
A ponyfill leaves the global context untouched, so there is no race to install,
but the calling code receives whatever the ponyfill chose for it rather than a
realm-wide consensus.

A *spackle* is both.
It installs a behavior on a shared intrinsic at a registered symbol, so every
copy of the module in the realm sees the same function.
It also exports a callable that prefers the installed behavior and falls back
to a local implementation.
The registered symbol turns the install site into a rendezvous: the first
instance to load wins, and subsequent instances find the property already
defined and call through to it.

Because spackle installs on a shared intrinsic (`Object`), the behavior is
carried into child compartments alongside the intrinsic itself.

## How `@endo/harden` uses spackle

The canonical instance of the pattern is `@endo/harden`.

`harden` is realm-wide for two reasons.
Performance: each instance maintains a `WeakSet` of already-hardened objects,
and duplicating that work across eval twins is wasteful.
Composition with HardenedJS: applications should be able to use hardened
modules whether or not they have called `lockdown`.

The spackle install lives at `Object[Symbol.for('harden')]`.
The package exports a callable so application code does not have to spell that
out:

```js
import { harden } from '@endo/harden';
harden(object);
```

Direct use of the installed property is equivalent:

```js
Object[Symbol.for('harden')](object);
```

Two coordinated behaviors share that install site.
If `lockdown` runs first, it installs a *volumetric* `harden` that traverses
the prototype chain; `@endo/harden` then defers to that installed function.
If `@endo/harden` runs first, it installs a *surface* `harden` that freezes
the object and its own properties without walking the prototype chain.
A surface `harden` is what makes hardened modules usable outside HardenedJS:
prototype-chain hardening would have effects similar to `lockdown` on shared
intrinsics, without `lockdown`'s tenancy-safety repairs.

Because the spackle install is non-configurable, a subsequent `lockdown` call
detects the corrupted environment and throws.
The diagnostic stack points to the module that initialized too early, so the
fix is to move that import after `lockdown`.
See [the harden package's README](https://github.com/endojs/endo/tree/master/packages/harden)
for the package-level detail.

## Forthcoming: `@endo/eventual-send`

Eventual send needs realm-wide identity, not merely realm-wide performance.
It recognizes and forwards messages through native promises that have been
marked at the rendezvous symbol, and it will need to mark non-native promises
and presences in the future.
Eval twins of eventual-send cannot diverge on which promise or presence is
which without losing the ability to deliver messages across the boundary.
A spackle install gives eventual send a single source of truth for marked
promises, presences, and the operations defined over them.

## Language evolution

Using a registered symbol as the install site preserves room for the
language committee.
A future `Object.harden` could replace `Object[Symbol.for('harden')]` directly.
Alternatively, a well-known `Symbol.harden` could be introduced, distinct from
`Symbol.for('harden')`, so that code running ahead of the specification can
tell the registered-symbol install from the well-known one and adapt.
The registered symbol is a deliberate choice for that reason: it gives
implementers a recognizable name without claiming a slot that the language
itself might want.

## Conclusion

This new invention enables us to make *hardened modules* and for applications
to use them without arranging shims.
These are modules that work with or without HardenedJS `lockdown`, within or
without compartments.
We are using this spackle pattern to make modules using `harden`,
`eventual-send`, `assert` / `errors`, and the causal `console` easier to adopt
and use.
