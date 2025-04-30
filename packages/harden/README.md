# harden

For common usage, this package provides an implementation of `harden` that will
freeze an object and its transitive properties, making them shallowly
immutable.
If used in composition with Lockdown in [HardenedJS](https://hardenedjs.org),
the `harden` function will fall through to the stronger global `harden`, which
freezes the transitive closure over both properties and prototypes.
Using this package's `harden` instead of the global `harden` renders that
library portable between HardenedJS and non-HardenedJS environments.

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
behaviors transitively produces values that sare safe to share with guest code.
In particular, this showcases the idiom of calling `harden` on a `const`
`export`, which unlike a `function` `export`, ensures that the `behavior`
function is hardened before any other module can refer to it, even if those
modules are in a dependency cycle.

## ses

The `@endo/harden/hardener.js` module also provides the implementation of
`makeHarden` that is used by [`ses`][SES] to create the `harden` available after
`lockdown`.
This is different only in that it hardens the prototype of any reachable
object.

[SES]: https://github.com/endojs/endo/tree/master/packages/ses
