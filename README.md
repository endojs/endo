# Bundle Source

This package creates source bundles from ES Modules, compatible with Agoric contracts and SwingSet vats.

To bundle your sources:

```js
import makeSourceBundle from '@agoric/bundle-source';

const { moduleFormat, source, sourceMap } = bundleSource(`${__dirname}/../path/to/toplevel`);
```
