/* global process */
import 'ses';
import fs from 'fs';
import { makeBundle } from '@endo/compartment-mapper/bundle.js';
import { minify } from 'terser';
import { fileURLToPath, pathToFileURL } from 'url';
import { hermesTransforms } from './hermes-transforms.js';

lockdown();

const resolve = (rel, abs) => fileURLToPath(new URL(rel, abs).toString());
// Resolve the `ses` package root via Node's package linkage rather than a
// relative walk from this script. `import.meta.resolve('ses/package.json')`
// returns the URL of the resolved `package.json`; the parent URL is the
// package root. This script lives in `packages/ses-test/scripts/` but builds
// the SES dist outputs into the SES package; using `import.meta.resolve`
// keeps that cross-package linkage decoupled from the filesystem layout.
// `import.meta.resolve` has been unflagged since Node 20.6 and is available
// on every Node version this repository's CI matrix targets.
const root = new URL('.', import.meta.resolve('ses/package.json')).toString();

const read = async location => fs.promises.readFile(fileURLToPath(location));
const write = async (target, content) => {
  const location = resolve(target, root);
  await fs.promises.writeFile(location, content);
};

/**
 * @param {object} [options]
 * @param {string} [options.buildType] Suffix used to build special bundles (e.g. 'hermes')
 */
const writeBundle = async ({ buildType } = {}) => {
  const text = await fs.promises.readFile(
    fileURLToPath(`${root}/package.json`),
    'utf8',
  );
  const packageJson = JSON.parse(text);
  const version = packageJson.version;

  const bundleFilePaths =
    buildType === 'hermes'
      ? ['dist/ses-hermes.cjs']
      : [
          'dist/ses.cjs',
          'dist/ses.mjs',
          'dist/ses.umd.js',
          'dist/lockdown.cjs',
          'dist/lockdown.mjs',
          'dist/lockdown.umd.js',
        ];

  const terseFilePaths =
    buildType === 'hermes'
      ? []
      : ['dist/ses.umd.min.js', 'dist/lockdown.umd.min.js'];

  const syncModuleTransforms =
    buildType === 'hermes' ? hermesTransforms : undefined;

  const bundle = await makeBundle(
    read,
    pathToFileURL(resolve('index.js', root)).toString(),
    { syncModuleTransforms },
  );
  const versionedBundle = `// ses@${version}\n${bundle}`;

  console.log(`-- Building '${buildType}' version of SES --`);
  console.log(`Bundle size: ${versionedBundle.length} bytes`);

  /** @type {string|undefined} */
  let terse;
  if (terseFilePaths.length) {
    const { code } = await minify(versionedBundle, {
      mangle: false,
      keep_classnames: true,
    });
    terse = code;
    assert.string(terse);
    console.log(`Minified bundle size: ${terse.length} bytes`);
  }

  await fs.promises.mkdir(resolve('dist', root), { recursive: true });

  await Promise.all([
    ...bundleFilePaths.map(dest => write(dest, versionedBundle)),
    ...terseFilePaths.map(dest => write(dest, terse)),
  ]);

  // When importing types from a CJS package, TS v5.5+ considers the "module"
  // field in `ses`' `package.json`, so any .d.ts file is considered to be "ESM
  // types".
  // For CJS, we need to provide a `.d.cts` file instead.
  // It's unclear if this file can be identical to the original in _all_ cases,
  // or just ours.
  // We imagine ES-specific types (e.g., `import.meta`) would break
  // in CJS, but generally consumers have `skipLibCheck` enabled.

  // Also: this operation is in this script for portability's sake.

  /** The "ESM types" */
  const sourceDTS = /** @type {string} */ (
    packageJson.exports['.'].import.types
  );
  /** The "CJS types" */
  const destDTS = /** @type {string} */ (
    packageJson.exports['.'].require.types
  );
  await fs.promises.copyFile(
    fileURLToPath(new URL(sourceDTS, root)),
    fileURLToPath(new URL(destDTS, root)),
  );
  console.log(`Copied ${sourceDTS} to ${destDTS}`);
};

const main = async () => {
  const buildType = process.argv[2] || 'vanilla';
  await writeBundle({ buildType });
};

main().catch(err => {
  console.error('Error running main:', err);
  process.exitCode = 1;
});
