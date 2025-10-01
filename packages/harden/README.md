# harden

Hardened modules are modules that make their exports resist tampering by other
modules that import them, making them less suceptible to supply chain attack.
In [HardenedJS](https://hardenedjs.org), the global `harden` function
transitively freezes an object and all of the objects that are reachable by
walking up chains of properties and prototypes.
All the primordials like `Array.prototype` and `Object` are frozen in
this environment, which gives your module a place to stand toward its own
defense.
Then, with [LavaMoat](https://github.com/lavamoat/lavamoat), each package
is credibly isolated and only receives the subset of globals and host modules
it needs to function.
That is, we can enforce [Principle of Least
Authority](https://en.wikipedia.org/wiki/Principle_of_least_privilege).
But, that leaves the module to use `harden` to freeze all its exports and
anything it returns that might be shared by other packages that use it.

In order to provide type information about the global `harden` in lockded-down
HardenedJS, and also to make it possible for hardened modules to be used
outside HardenedJS, the `@endo/harden` package exports a `harden` function that
can be used either way.

```js
import { harden } from '@endo/harden';

export const myFunction = () => {};
harden(myFunction);
```

By avoiding the export of hoisted `function` and `var` declarations and by
immediately calling `harden` on any exposed function (or prototype thereof!) we
leave no window of opportunity for another module to alter our exports.
Depending on whether the objects our functions return to be shared by multiple
parties (like memoized objects), a hardened module author should consider
hardening those objects too.

# With HardenedJS

The package `@endo/harden` reexports the `globalThis.harden` or
`Object[Symbol.for('harden')]` in its execution environment, in order of
preference, and is suitable regardless of whether a module is used
with or without HardenedJS.

When using SES, `lockdown` creates `globalThis.harden` in the Realm's
intrinsic `globalThis` and also automatically endows `globalThis.harden`
to any `Compartment`.
It is possible to delete `globalThis.harden` on new compartments.
However, every version of SES published since the introduction of `@endo/harden`
also provides `Object[Symbol.for('harden')]`, which is a property of one
of the hardened shared intrinsics and cannot be subverted in a compartment.

The `harden` in `@endo/harden` prefers `globalThis.harden` because this
affords the greatest degree of flexibility.
Any multi-tenant `Compartment` should freeze its own `globalThis`, including
making `harden` non-configurable and non-writable, so there is no risk
of tampering, and endowing a `Compartment` with a different `harden`
than the Realm's `Object[Symbol.for('harden')]` may be useful for some
cases.

When creating a bundle for an application that can safely assume it will run in
a HardenedJS environment, consider passing the build condition `-C hardened`.
This will provide the smallest version of `@endo/harden`, one which will throw
an exception if `harden` is not present.

```
bundle-source -C hardened entry.js > entry.json
```

# Without HardenedJS

Libraries that use `@endo/harden` can be used without HardenedJS and the
exported `harden` does nothing.

A future version may provide stronger `harden` modes that are not as strong as
HardenedJS but provide some degree of hardening for safety and preserving
certain immutability invariants, at least for own properties.

# Multiple instances

The first instance of `@endo/harden` will determine the behavior of any
subsequent instance of `@endo/harden` that initializes later, regardless of
differences in behavior.
In a mutable, pre-lockdown JavaScript environment, it does this by behaving
somewhat like a shim.
A side-effect of the _first use_ of `harden` is that it installs its flavor of
`harden` at `Object[Symbol.for('harden')]` and all subsequent initializations
just adopt that behavior.
This property is how `lockdown` senses that it should fail.

# With _or_ Without _not_ Both

Hardened modules calling `harden` should be fine at any time in an application
that never uses HardenedJS, calling `lockdown`.

However, initializing a hardened module before setting up a HardenedJS
environment (before calling `lockdown`) and then proceeding on the assumption
that it's hardened after `lockdown` would leave the apparently-hardened module
vulnerable.

So, `@endo/harden` arranges for `lockdown()` to throw an exception with
a _helpful_ stack if `harden` gets called before `lockdown`.
The stack points to the module that was initialized before `lockdown`
and which should be moved after `lockdown`.
The `lockdown` call often occurs as a side-effect of initializing
`@endo/lockdown`, `@endo/init`, or by convention, modules with names like
`prepare-*`.

# Configurability of Compartment harden

The `harden` exported by `@endo/harden` will defer to `globalThis.harden` if
one was endowed, regardless of the presence of `Object[Symbol.for('harden')]`
on the shared intrinsic.

