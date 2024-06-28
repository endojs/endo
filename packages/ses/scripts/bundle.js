/* global process */
import '../index.js';
import fs from 'fs';
import { makeBundle } from '@endo/compartment-mapper/bundle.js';
import { minify } from 'terser';
import { fileURLToPath, pathToFileURL } from 'url';

const resolve = (rel, abs) => fileURLToPath(new URL(rel, abs).toString());
const root = new URL('..', import.meta.url).toString();

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
  const version = buildType
    ? `${packageJson.version}-${buildType}`
    : packageJson.version;

  const entryPointPath = `../index${buildType ? `-${buildType}` : ''}.js`;
  console.log(`Bundle entrypoint: ${entryPointPath}`);

  const bundle = await makeBundle(
    read,
    pathToFileURL(resolve(entryPointPath, import.meta.url)).toString(),
  );

  const versionedBundle = `// ses@${version}\n${bundle}`;

  const { code: terse } = await minify(versionedBundle, {
    mangle: false,
    keep_classnames: true,
  });
  assert.string(terse);

  console.log(`Bundle size: ${versionedBundle.length} bytes`);
  console.log(`Minified bundle size: ${terse.length} bytes`);

  await fs.promises.mkdir('dist', { recursive: true });

  const bundleFilePaths = [
    `dist/ses${buildType ? `-${buildType}` : ''}.cjs`,
    `dist/ses${buildType ? `-${buildType}` : ''}.mjs`,
    `dist/ses${buildType ? `-${buildType}` : ''}.umd.js`,
    `dist/lockdown${buildType ? `-${buildType}` : ''}.cjs`,
    `dist/lockdown${buildType ? `-${buildType}` : ''}.mjs`,
    `dist/lockdown${buildType ? `-${buildType}` : ''}.umd.js`,
  ];
  const terseFilePaths = [
    `dist/ses${buildType ? `-${buildType}` : ''}.umd.min.js`,
    `dist/lockdown${buildType ? `-${buildType}` : ''}.umd.min.js`,
  ];

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
  await writeBundle({ buildType: process.env.SES_BUILD_TYPE || undefined });
};

main().catch(err => {
  console.error('Error running main:', err);
  process.exitCode = 1;
});
