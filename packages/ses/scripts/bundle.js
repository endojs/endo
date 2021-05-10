import '../index.js';
import fs from 'fs';
import { makeBundle } from '@agoric/compartment-mapper';
import prettier from 'prettier';
import terser from 'terser';

const resolve = (rel, abs) => new URL(rel, abs).toString();
const root = resolve('..', import.meta.url);

const read = async location => fs.promises.readFile(new URL(location).pathname);
const write = async (target, content) => {
  const location = resolve(target, root);
  await fs.promises.writeFile(new URL(location).pathname, content);
};

(async () => {
  const bundle = await makeBundle(
    read,
    resolve('../index.js', import.meta.url),
  );
  const pretty = prettier.format(bundle);
  const { code: terse } = terser.minify(bundle);

  console.log(`Bundle size: ${pretty.length} bytes`);
  console.log(`Minified bundle size: ${terse.length} bytes`);

  await write('dist/ses.cjs', pretty);
  await write('dist/ses.mjs', pretty);
  await write('dist/ses.umd.js', pretty);
  await write('dist/ses.umd.min.js', terse);

  await write('dist/lockdown.cjs', pretty);
  await write('dist/lockdown.mjs', pretty);
  await write('dist/lockdown.umd.js', pretty);
  await write('dist/lockdown.umd.min.js', terse);
})();
