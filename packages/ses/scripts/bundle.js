import '../index.js';
import fs from 'fs';
import { makeBundle } from '@endo/compartment-mapper/bundle.js';
import terser from 'terser';
import { fileURLToPath, pathToFileURL } from 'url';

const resolve = (rel, abs) => fileURLToPath(new URL(rel, abs));
const root = new URL('../', import.meta.url);

const read = async location => fs.promises.readFile(fileURLToPath(location));
const write = async (target, content) => {
  const location = resolve(target, root);
  await fs.promises.writeFile(location, content);
};

(async () => {
  const bundle = await makeBundle(
    read,
    pathToFileURL(resolve('../index.js', import.meta.url)),
  );
  const { code: terse } = terser.minify(bundle, {
    mangle: false,
    keep_classnames: true,
  });

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
})();
