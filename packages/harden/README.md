# harden

For common usage, this package provides an implementation of `harden` that will
freeze an object and its transitive own properties, making them shallowly
immutable.
Harden uses a _reflective_ transitive visit over properties, so it will not
trap getters or setters but will transitively visit and freeze the `get` and
`set` functions it encounters.

If used in composition with `lockdown` in [HardenedJS](https://hardenedjs.org),
the `harden` function will fall through to the stronger global `harden`, which
freezes the transitive closure over both properties and prototypes.
Using this package's `harden` instead of the global `harden` renders that
library portable between HardenedJS and non-HardenedJS environments.

If used with the package condition `harden`, as when running `node -C harden`
or `bundle-source -C harden`, the `@endo/harden` package will omit its
redundant implementation of `harden` and simply assert the presence of and
reexport the existing `globalThis.harden`.

Usage:

```
import { harden } from '@endo/harden';

export const behavior = () => {
  return harden({});
};
harden(behavior);
```

In this example, we create a hadened module.
That is, the module's surface and any value reachable by interacting with its
behaviors transitively produces values that are safe to share with guest code.
In particular, this showcases the idiom of calling `harden` on a `const`
`export`, which unlike a `function` `export`, ensures that the `behavior`
function is hardened before any other module can refer to it, even if those
modules are in a dependency cycle.

The `harden` function should only be used in programs that either:
* never call `lockdown`, or
* never call `harden` before `lockdown`,
to avoid the misconception that an object hardened before `lockdown`
is as hardened as an object hardened after `lockdown`.
For example, an object hardened before `lockdown` may have an unfrozen,
non-intrinsic prototype that would remain mutable after `lockdown`, but would
be `frozen` if `harden` were called after `lockdown` instead.

## ses

The `@endo/harden/hardener.js` module also provides the implementation of
`makeHarden` that is used by [`ses`][SES] to create the `harden` available after
`lockdown`.
This is different only in that it hardens the prototype of any reachable
object.

[SES]: https://github.com/endojs/endo/tree/master/packages/ses
