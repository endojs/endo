# import-bundle

`importBundle` is an async function that evaluates the bundles created by `bundle-source`, turning them back into callable functions:

```js
const bundle = await bundleSource('path/to/bundle.js');
// 'bundle' is JSON-serializable
const options = {}; // filePrefix, endowments, other compartment options
const namespace = await importBundle(bundle);
const { default, namedExport1, namedExport2 } = namespace;
```

This must be run in a SES environment: you must install SES before importing `@endo/import-bundle`. The conventional way to do this is to import a module (e.g. `@endo/init`) which does `import 'ses'; lockdown();`.

The bundle will be loaded into a new Compartment, which does not have access to platform globals like `document` or `Fetch` or `require`. The bundle is isolated to only having access to powerless JavaScript facilities and whatever endowments you provide.

Each call to `importBundle` creates a new `Compartment`. The globals of the new Compartment are frozen before any bundle code is evaluated, to enforce ocap rules.

## Module Formats

The source can be bundled in a variety of "formats".

By default, `bundleSource` uses a format named `endoZipBase64`, in which the source modules and a "compartment map" are captured in a Zip file and base-64 encoded. The compartment map describes how to construct a set of [Hardened JavaScript](https://hardenedjs.org) compartments and how to load and link the source modules between them.

The `endoScript` format captures the sources as a single JavaScript program that completes with the entry module's namespace object.

The `getExport` format captures the sources as a single CommonJS-style string, and wrapped in a callable function that provides the `exports` and `module.exports` context to which the exports can be attached.

More sophisticated than `getExport` is named `nestedEvaluate`. In this mode, the source tree is converted into a table of evaluable strings, one for each original module. This table is then encoded and wrapped as before. The evaluation process uses a separate evaluator call for each module, providing an opportunity to attach a distinct `sourceMap` to each one. This preserves relative filenames in subsequent debugging information and stack traces.

To set a base prefix for these relative filenames, provide the `filePrefix` option.

Note that the `nestedEvaluate` format receives a global endowment named `require`, although it will only be called if the source tree imported one of the few modules on the `bundle-source` "external" list.

## Options

`importBundle()` takes an options bag and optional additional powers.

```js
const namespace = await importBundle(bundle, options, powers);
```

The most common option is `filePrefix`, which can be provided for `nestedEvaluate`-format bundles. This sets the source filename of the top-level module inside the bundle, as used in debugging messages (like the stack traces displayed in errors). The other modules will append a suffix to this filename, based upon their location within the original source tree.

Another common option is `endowments`, which provides names that will be available everywhere in the evaluated sources. By default, the bundle will only get access to the standard JavaScript primordials (`Array`, `Object`, `Map`, etc). It will not get `document`, `window`, `Request`, `process`, `require`, or even `console` unless you provide them as endowments, giving you full control over what the loaded bundle can do.

The `bundle-source` tool has a small number of module names marked as "external". These modules are not bundled into the source (copied from the filesystem where `bundleSource` was called). Instead, the bundler injects a call to `require()` for each external module that was imported from somewhere in original source graph. This let the final evaluation environment control what these imports get, rather than the original source tree.

To support these "external" imports, you will need to provide a `require` endowment that can honor any such names. In addition, the `nestedEvaluate` format always needs a `require` endowment (although it will only be called if the original sources imported one of the "external" names).

For debugging purposes, you should probably provide a `console` endowment. See `makeConsole.js` in the SwingSet source tree for inspiration.

The rest of the `options` are passed through to the `Compartment` constructor, which currently only accepts `transforms`. For more information, see the `compartment-shim` docs in the SES repository. Note that `transforms` is defined to be an array of objects which each have a `rewrite` method.

Note that `sloppyGlobalsMode` is only accepted by the Compartment's `evaluate` method, not the Compartment constructor itself, and thus cannot be supplied to `importBundle`. To use `sloppyGlobalsMode`, you will probably want to create a Compartment directly (and not freeze its globals).

## Source maps

For an Endo (zip, base64) bundle, `bundleSource` will add source maps to a
per-user cache so they can be debugged if imported on the same host.
To use this facility, pass a `computeSourceMapLocation` capability into
`powers`.

```js
import 'ses';
import bundleSource from '@endo/bundle-source';
import { importBundle } from '@endo/import-bundle';
import { computeSourceMapLocation } from '@endo/import-bundle/source-map-node.js';

lockdown();
const bundle = await bundleSource('debugme.js');
await importBundle(
  bundle,
  { endowments: { console } },
  { computeSourceMapLocation },
);
```

Use `node --inspect-brk` and `debugger` statements.
