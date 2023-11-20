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
  const bytes = await fs.promises.readFile(
    fileURLToPath(`${root}/package.json`),
  );
  const text = textDecoder.decode(bytes);
  const packageJson = JSON.parse(text);
  const version = packageJson.version;

  const bundle = `// ses@${version}\n${await makeBundle(
    read,
    pathToFileURL(resolve('../index.js', import.meta.url)).toString(),
  )}`;
  const { code: terse } = await minify(bundle, {
    mangle: false,
    keep_classnames: true,
  });
  assert.string(terse);

  console.log(`Bundle size: ${bundle.length} bytes`);
  console.log(`Minified bundle size: ${terse.length} bytes`);

  await fs.promises.mkdir('dist', { recursive: true });
  await write('dist/ses.cjs', bundle);
  await write('dist/ses.mjs', bundle);
  await write('dist/ses.umd.js', bundle);
  await write('dist/ses.umd.min.js', terse);

  await write('dist/lockdown.cjs', bundle);
  await write('dist/lockdown.mjs', bundle);
  await write('dist/lockdown.umd.js', bundle);
  await write('dist/lockdown.umd.min.js', terse);
};

main().catch(err => {
  console.error('Error running main:', err);
  process.exitCode = 1;
});
