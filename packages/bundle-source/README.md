# Bundle Source

This package creates source bundles from ES Modules, compatible with Endo
applications, Agoric contracts, and SwingSet vats.

To bundle a program that enters at `program.js` from the command line, use the
`bundle-source` tool:

```console
> yarn bundle-source --cache-json bundles program.js program
```

To do the same programmatically:

```js
import 'ses';
import bundleSource from '@endo/bundle-source';
import url from 'url';

const sourceBundleURL = new URL('program.js', import.meta.url);
const sourceBundlePath = url.fileURLToPath(sourceBundleURL);
const sourceBundleP = bundleSource(sourceBundlePath);
```

…to get a promise for a source bundle, that resolves after reading the
named sources and bundling them into a form that vats can load, as indicated
by the `moduleFormat` below.

The resulting bundle is suitable for use with `@endo/import-bundle`.
The default format is of a bundle is `"endoZipBase64"`.

## Conditions

Node.js introduced [conditions](https://nodejs.org/api/packages.html#conditional-exports).
The `--condition` and `-C` flags accordingly influence `bundle-source` module
resolution decisions.

The `browser` condition additionally implies the selection of the `browser`
entry instead of `main` in `package.json`, if not overridden by explicit
`exports`.

The `development` condition additionally implies that the bundle may import
`devDependencies` from the package containing the entry module.

## Comment Elision

The `--elide-comments (`-e`) flag with `--format` (`-f`) `endoScript` or
`endoZipBase64` (default) causes the bundler to blank out the interior of
comments, without compromising line or column number cursor advancement.
This can reduce bundle size without harming the debug experience any more than
other transforms.

Comment elision preserves `/*! slashasterbang /` comments and JSDoc comments
with `@preserve`, `@copyright`, `@license` pragmas or the Internet Explorer
`@cc_on` pragma.

Comment elision does not strip comments entirely.
The syntax to begin or end comments remains.

## TypeScript type erasure

TypeScript modules with the `.ts`, `.mts`, and `.cts` extensions in
packages that are not under a `node_modules` directory are automatically
converted to JavaScript through type erasure using
[`ts-blank-space`](https://bloomberg.github.io/ts-blank-space/).

This will not function for packages that are published as their original
TypeScript sources, as is consistent with `node
--experimental-strip-types`.
This will also not function properly for TypeScript modules that have
[runtime impacting syntax](https://github.com/bloomberg/ts-blank-space/blob/main/docs/unsupported_syntax.md),
such as `enum`.

This also does not support importing a `.ts` file using the corresponding
imaginary, generated module with a `.js` extension.
Use this feature in conjunction with
[`--allowImportingTsExtensions`](https://www.typescriptlang.org/tsconfig/#allowImportingTsExtensions).

## Source maps

With the `moduleFormat` of `endoZipBase64`, the bundler can generate source
maps but does not include them in the bundle itself.
Use the `cacheSourceMaps` option to render source maps into a per-user per-host
cache.

The `@endo/import-bundle` utility can add references to these generated
source maps when it unpacks a bundle, provided a suitable
`computeSourceMapLocation` power, like the one provided by
`@endo/import-bundle/source-map-node.js`.

```js
import 'ses';
import { importBundle } from '@endo/import-bundle';
import { computeSourceMapLocation } from '@endo/import-bundle/source-map-node.js';
await importBundle(
  bundle,
  { endowments: { console } },
  { computeSourceMapLocation },
);
```

Use the `@endo/cli` to find your cache.

```console
> yarn add -D @endo/cli
> yarn endo where cache
```

Use the `XDG_CACHE_HOME` environment variable to override the default location
of caches in general.
The caches will be in `endo/source-map` and `endo/source-map-track`.
The former is a content-address-store keyed on the SHA-512 of each bundled
module file.
The latter is a location-address-store keyed on the SHA-512 of the fully
qualified path of the module source, indicating the last known bundle hash.
The bundler uses the tracker to ensure that the cache only contains one source
map for every physical module.
It is not yet quite clever enough to collect source maps for sources that do
not exist.

## getExport moduleFormat

The most primitive `moduleFormat` is the `"getExport"` format.
It generates a script where the completion value (last expression evaluated)
is a function that accepts an optional `sourceUrlPrefix`.

```js
cosnt { source } = await bundleSource('program.js', { format: 'getExport' });
const exports = eval(source)();
```

A bundle in `getExport` format can import host modules through a
lexically-scoped CommonJS `require` function.
One can be endowed using a Hardened JavaScript `Compartment`.

```js
const compartment = new Compartment({
  globals: { require },
  __options__: true, // until SES and XS implementations converge
});
const exports = compartment.evaluate(source)();
```

> [!WARNING]
> The `getExport` format was previously implemented using
> [Rollup](https://rollupjs.org/) and is implemented with
> `@endo/compartment-mapper/functor.js` starting with version 4 of
> `@endo/bundle-source`.
> See `nestedEvaluate` below for compatibility caveats.

## nestedEvaluate moduleFormat

This is logically similar to the `getExport` format, except that the code
may additionally depend upon a `nestedEvaluate(src)` function to be used
to evaluate submodules in the same context as the parent function.

The advantage of this format is that it helps preserve the filenames within
the bundle in the event of any stack traces.

The completion value of a `nestedEvaluate` bundle is a function that accepts
the `sourceUrlPrefix` for every module in the bundle, which will appear in stack
traces and assist debuggers to find a matching source file.

```js
cosnt { source } = await bundleSource('program.js', { format: 'nestedEvaluate' });
const compartment = new Compartment({
  globals: {
    require,
    nestedEvaluate: source => compartment.evaluate(source),
  },
  __options__: true, // until SES and XS implementations converge
});
const exports = compartment.evaluate(source)('bundled-sources/.../');
```

In the absence of a `nextedEvaluate` function in lexical scope, the bundle will
use the `eval` function in lexical scope.

> [!WARNING]
> The `nestedEvaluate` format was previously implemented using
> [Rollup](https://rollupjs.org/) and is implemented with
> `@endo/compartment-mapper/functor.js` starting with version 4 of
> `@endo/bundle-source`.
> Their behaviors are not identical.
>
> 1. Version 3 used different heuristics than Node.js 18 for inferring whether
>    a module was in CommonJS format or ESM format. Version 4 does not guess,
>    but relies on the `"type": "module"` directive in `package.json` to indicate
>    that a `.js` extension implies ESM format, or respects the explicit `.cjs`
>    and `.mjs` extensions.
> 2. Version 3 supports [live
>    bindings](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import#imported_values_can_only_be_modified_by_the_exporter)
>    and Version 4 does not.
> 3. Version 3 can import any package that is discoverable by walking parent directories
>    until the dependency or devDependeny is found in a `node_modules` directory.
>    Version 4 requires that the dependent package explicitly note the dependency
>    in `package.json`.
> 4. Version 3 and 4 generate different text.
>    Any treatment of that text that is sensitive to the exact shape of the
>    text is fragile and may break even between minor and patch versions.
> 5. Version 4 makes flags already supported by `endoZipBase64` format
>    universal to all formats, including `dev`, `elideComments`,
>    `noTransforms`, and `conditions`.

## endoScript moduleFormat

The `ses` shim uses the `endoScript` format to generate its distribution bundles,
suitable for injecting in a web page with a `<script>` tag.
For this format, extract the `source` from the generated JSON envelope and place
it in a file you embed in a web page, an Agoric
[Core Eval](https://docs.agoric.com/guides/coreeval/) script, or evaluate
anywhere that accepts scripts.

```js
const { source } = await bundleSource('program.js', { format: 'endoScript' });
const compartment = new Compartment();
compartment.evaluate(source);
```

Unlike `getExport` and `nestedEvaluate`, the `dev` option to `bundleSource` is
required for any bundle that imports `devDependencies`.
The `endoScript` format does not support importing host modules with CommonJS
`require`.

## endoZipBase64 moduleFormat

An Endo (zip, base64) bundle is an object with properties:

- `moduleFormat` is `"endoZipBase64"`
- `endoZipBase64` is a base 64 encoded zip file.
- `endoZipBase64Sha512`, if present, is the SHA-512 of the
  `compartment-map.json` file inside the `endoZipBase64` archive.
  If the `compartment-map.json` includes the SHA-512 of every module, this is
  sufficient as a hash of the bundled application for checking its integrity
  and is consistent regardless of whether the program is extracted from the
  archive.

To inspect the contents of a bundle in a JSON file:

```
jq -r .endoZipBase64 | base64 -d | xxd | less
```

To extract the contents:

```
jq -r .endoZipBase64 | base64 -d > bundle.zip
unzip bundle.zip -d bundle
```

Inside the zip file, the `compartment-map.json` expresses the entire linkage of
the bundled program starting at its entry module, with explicitly marked "exit"
modules (host modules that must be endowed).

The compartment map then names all of its compartments, and within each
compartment, specifies each module that will be evaluated in that compartment.
These indicate the path within the archive of the physical text of the module.
The `parser` indicates how `importBundle` or the equivalent Compartment Mapper
utilities will interpret the physical text of the module.

To avoid entraining large dependencies and a slow precompilation step, modules
in a bundle are currently precompiled, so instead of finding source text, you
will find a JSON record describing the bindings and behavior of the module,
including code that is similar to the source but not identical.

The bundle may have any of these `"parser"` properties:

- `pre-mjs-json`: precompiled ESM
- `pre-cjs-json`: precompiled CommonJS
- `json`: raw JSON (exports the corresponding value as `default`)
- `text`: UTF-8 encoded text (exports the corresponding `string` as `default`)
- `bytes`: bytes (exports the corresponding `Uint8Array` as `default`)

The JSON of a `pre-mjs-json` module will have all the properties of an object
generated with `StaticModuleRecord` from `@endo/static-module-record`, but
particularly:

- `__syncModuleProgram__`: the code, which has been transformed from the ESM
  source to a program that a compartment can evaluate and bind to other ESM
  modules, and also had certain censorship-evasion transforms applied.

So, to extract the source-similar program for visual inspection:

```
jq -r .__syncModuleProgram module.js > module.source.js
```

