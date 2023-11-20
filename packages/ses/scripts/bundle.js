/* global process */
import '../index.js';
import fs from 'fs';
import { makeBundle } from '@endo/compartment-mapper/bundle.js';
import { minify } from 'terser';
import { fileURLToPath, pathToFileURL } from 'url';

const textDecoder = new TextDecoder();

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
    'utf8'
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
  await write('dist/ses.cjs', versionedBundle);
  await write('dist/ses.mjs', versionedBundle);
  await write('dist/ses.umd.js', versionedBundle);
  await write('dist/ses.umd.min.js', terse);

  await write('dist/lockdown.cjs', versionedBundle);
  await write('dist/lockdown.mjs', versionedBundle);
  await write('dist/lockdown.umd.js', versionedBundle);
  await write('dist/lockdown.umd.min.js', terse);
};

main().catch(err => {
  console.error('Error running main:', err);
  process.exitCode = 1;
});
