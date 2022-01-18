# Bundle Source

This package creates source bundles from ES Modules, compatible with Agoric contracts and SwingSet vats.

To bundle your sources, first do

```js
import bundleSource from '@agoric/bundle-source';

const sourceBundleP = bundleSource(new URL('../path/to/toplevel', import.meta.url).pathname);
```
to get a promise for a source bundle, that resolves after reading the
named sources and bundling them into a form that vats can load, as indicated
by the `moduleFormat` below. Currently, the only supported module format
is `getExport`. Note that this way of loading external modules is likely to
change.

To obtain the contents of the promised `sourceBundleP`, once it resolves, do:
```js
sourceBundleP.then(({moduleFormat, source, sourceMap}) => ...);
```
or inside an async function (and therefore outside of Jessie), do:

```js
const { moduleFormat, source, sourceMap } = await sourceBundleP;
...
```

## getExport moduleFormat

The first main `moduleFormat` is the `"getExport"` format.  It generates
source like:

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
