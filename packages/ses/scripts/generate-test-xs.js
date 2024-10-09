/* eslint-env node */
/* glimport/no-extraneous-dependenciesobal process */
import '../index.js';
import { promises as fs } from 'fs';
// Lerna does not like dependency cycles.
// With an explicit devDependency from module-source to compartment-mapper,
// the build script stalls before running every package's build script.
//   yarn lerna run build
// Omitting the dependency from package.json solves the problem and works
// by dint of shared workspace node_modules.
// eslint-disable-next-line import/no-extraneous-dependencies
import { makeBundle } from '@endo/compartment-mapper/bundle.js';
// eslint-disable-next-line import/no-extraneous-dependencies
import { ModuleSource } from '@endo/module-source';
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
  await fs.mkdir(fileURLToPath(new URL('../tmp', import.meta.url)), {
    recursive: true,
  });

  const meaningText = await fs.readFile(
    fileURLToPath(new URL('../test/_meaning.js', import.meta.url)),
    'utf8',
  );
  const meaningModuleSource = new ModuleSource(meaningText);

  await fs.writeFile(
    fileURLToPath(new URL('../tmp/_meaning.pre-mjs.json', import.meta.url)),
    JSON.stringify(meaningModuleSource),
  );

  const xsPrelude = await makeBundle(
    read,
    new URL('../test/_xs.js', import.meta.url).href,
    {
      tags: new Set(['xs']),
    },
  );

  await write(new URL('../tmp/test-xs.js', import.meta.url).href, xsPrelude);
};

main().catch(err => {
  console.error('Error running main:', err);
  process.exitCode = 1;
});
