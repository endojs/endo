/* global process */
import 'ses';
import { promises as fs } from 'fs';
// Lerna does not like dependency cycles.
// With an explicit devDependency from module-source to compartment-mapper,
// the build script stalls before running every package's build script.
//   yarn lerna run build
// Omitting the dependency from package.json solves the problem and works
// by dint of shared workspace node_modules.
// eslint-disable-next-line import/no-extraneous-dependencies
import { makeBundle } from '@endo/compartment-mapper/bundle.js';
import { fileURLToPath } from 'url';

const read = async location => {
  const path = fileURLToPath(location);
  return fs.readFile(path);
};
const write = async (location, content) => {
  const path = fileURLToPath(location);
  await fs.writeFile(path, content);
};

const main = async () => {
  const xsPrelude = await makeBundle(
    read,
    new URL('../test/_xs.js', import.meta.url).href,
    {
      tags: new Set(['xs']),
    },
  );

  await fs.mkdir(fileURLToPath(new URL('../tmp', import.meta.url)), {
    recursive: true,
  });
  await write(new URL('../tmp/test-xs.js', import.meta.url).href, xsPrelude);
};

main().catch(err => {
  console.error('Error running main:', err);
  process.exitCode = 1;
});
