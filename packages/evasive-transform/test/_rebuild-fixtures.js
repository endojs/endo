/**
 * Script to rebuild the fixture packages
 *
 * - Each package should contain an `index.js` entry point
 * - Bundle will be CJS and output to the `cjs` subdir of the package root
 *   alongside a source map
 *
 * After running this, you may need to run `ava -u` to update snapshots.
 *
 * @module
 */

import { rollup } from 'rollup';
import commonjs from '@rollup/plugin-commonjs';
// @ts-expect-error xxx typedefs
import resolve from '@rollup/plugin-node-resolve';
import path from 'node:path';
import url from 'node:url';

/**
 * Add more relative package paths here
 */
const FIXTURES = ['./fixtures-transform/test-location-unmapper'];

for await (const fixture of FIXTURES) {
  const fixturePath = url.fileURLToPath(new URL(fixture, import.meta.url));
  const bundle = await rollup({
    input: path.resolve(
      url.fileURLToPath(
        new URL(path.join(fixturePath, 'index.js'), import.meta.url),
      ),
    ),
    treeshake: false,
    // @ts-expect-error xxx typedefs
    plugins: [resolve({ preferBuiltins: true }), commonjs()],
  });

  await bundle.write({
    exports: 'named',
    format: 'cjs',
    sourcemap: true,
    dir: path.join(fixturePath, 'cjs'),
    entryFileNames: '[name].cjs',
  });
}
