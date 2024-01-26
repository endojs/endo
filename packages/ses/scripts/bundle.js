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

const main = async () => {
  const text = await fs.promises.readFile(
    fileURLToPath(`${root}/package.json`),
    'utf8',
  );
  const packageJson = JSON.parse(text);
  const version = packageJson.version;

  const bundle = await makeBundle(
    read,
    pathToFileURL(resolve('../index.js', import.meta.url)).toString(),
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
    'dist/ses.cjs',
    'dist/ses.mjs',
    'dist/ses.umd.js',
    'dist/lockdown.cjs',
    'dist/lockdown.mjs',
    'dist/lockdown.umd.js',
  ];
  const terseFilePaths = ['dist/ses.umd.min.js', 'dist/lockdown.umd.min.js'];

  await Promise.all([
    ...bundleFilePaths.map(dest => write(dest, versionedBundle)),
    ...terseFilePaths.map(dest => write(dest, terse)),
  ]);
};

main().catch(err => {
  console.error('Error running main:', err);
  process.exitCode = 1;
});
