# ModuleSource

This package provides a ponyfill for the `ModuleSource` constructor, suitable
for use in the SES shim's module descriptors.
The module source accepts a JavaScript module and converts it into
a form that SES can use to emulate and confine JavaScript modules (ESMs, the
`mjs` file format) with compartments.

```js
import 'ses';
import { ModuleSource } from '@endo/module-source`;

const c1 = new Compartment({}, {}, {
  name: "first compartment",
  resolveHook: (moduleSpecifier, moduleReferrer) => {
    return resolve(moduleSpecifier, moduleReferrer);
  },
  importHook: async moduleSpecifier => {
    const moduleLocation = locate(moduleSpecifier);
    const moduleText = await retrieve(moduleLocation);
    return new ModuleSource(moduleText, moduleLocation);
  },
});
```

## Source maps

The `ModuleSource` is a shim for what we hope to eventually call a native
`ModuleSource` constructor.
However, in the absence of a native `ModuleSource`, this produces a
serializable object that emulates the behavior of `ModuleSource` in conjunction
with the `Compartment` constructor from `ses`.
A detail that leaks from the implementation is that the constructor rewrites
the source, from an ESM `[[Module]]` grammar construction to a `[[Program]]`
construction suitable for confining with the compartment's confined evaluator.

This transform attempts to be unobtrusive, but currently causes some alignment
changes due to (hopefully temporary) limitations to the underlying code
generator.
In the interim, generating a source map can help.

The `ModuleSource` constructor accepts non-standards-track
`sourceMapHook` and `sourceMapUrl` options.

Previously, the sole option was a `string` argument for the `sourceUrl`, such
that this would be appended to the generated source.
This change allows for the old or new usage:

```js
new ModuleSource(source, sourceUrl);
// or
new ModuleSource(source, { sourceUrl, sourceMapUrl, sourceMapHook });
```

The `sourceMapUrl` is necessary for generating a source map.
The URL will appear only in the generated source map, so a fully qualified
source map URL is safe and allows for continuity if the map is generated and
debugged on the same host.
This is important because Endo captures precompiled Static Module Records in
bundles, excluding source maps, such that a relative path is not useful.

The `sourceMapHook` will receive a string source map and a details bag
including:

- `source`
- `sourceUrl`
- `sourceMapUrl`

Such that the receiver can store the source map somewhere as a side-effect.

Note: the `sourceMapHook` is synchronous and returns `void`.
Exceptions thrown by the hook will propagate up through the constructor.  If
the hook returns a promise, it will be dropped and rejections will go uncaught.
If the hook must do async work, these should be queued up as a job that the
caller can later await.

## Bug Disclosure

Please help us practice coordinated security bug disclosure, by using the
instructions in
[SECURITY.md](https://github.com/endojs/endo/blob/master/packages/ses/SECURITY.md)
to report security-sensitive bugs privately.

For non-security bugs, please use the [regular Issues
page](https://github.com/endojs/endo/issues).
