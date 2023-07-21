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
The default format is `moduleFormat` of a bundle is `"endoZipBase64"`.

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
The the latter is a location-address-store keyed on the SHA-512 of the fully
qualified path of the module source, indicating the last known bundle hash.
The bundler uses the tracker to ensure that the cache only contains one source
map for every physical module.
It is not yet quite clever enough to collect source maps for sources that do
not exist.

## getExport moduleFormat

The most primitive `moduleFormat` is the `"getExport"` format.
It generates source like:

```js
function getExport() {
  let exports = {};
  const module = { exports };
  // CommonJS source translated from the inputs.
  ...
  return module.exports;
}
```

To evaluate it and obtain the resulting module namespace, you need to endow
a `require` function to resolve external imports.

## nestedEvaluate moduleFormat

This is logically similar to the `getExport` format, except that the code
may additionally depend upon a `nestedEvaluate(src)` function to be used
to evaluate submodules in the same context as the parent function.

The advantage of this format is that it helps preserve the filenames within
the bundle in the event of any stack traces.

Also, the toplevel `getExport(filePrefix = "/bundled-source")` accepts an
optional `filePrefix` argument (which is prepended to relative paths for the
bundled files) in order to help give context to stack traces.

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
jq -r .endoZipBase64 | base64 -d > bundle.json
unzip bundle.json -d bundle
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

