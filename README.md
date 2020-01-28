# Bundle Source

This package creates source bundles from ES Modules, compatible with Agoric contracts and SwingSet vats.

To bundle your sources, first do

```js
import bundleSource from '@agoric/bundle-source';

const sourceBundleP = bundleSource(`${__dirname}/../path/to/toplevel`);
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
