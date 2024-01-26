# @endo/transforms fixture project

The files in `dist/` can be generated via:

```js
import { rollup } from 'rollup';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import path from 'node:path';
import url from 'node:url';

const bundle = await rollup({
  input: path.resolve(
    url.fileURLToPath(new URL(`./src/index.js`, import.meta.url)),
  ),
  treeshake: false,
  plugins: [resolve({ preferBuiltins: true }), commonjs()],
  output: {entryFileNames: '[name].mjs'}
});

await bundle.write({
  exports: 'named',
  format: 'cjs',
  sourcemap: true,
  dir: 'dist',
});
```
