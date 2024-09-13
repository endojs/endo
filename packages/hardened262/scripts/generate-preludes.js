/* global process */
import 'ses';
import { promises as fs } from 'fs';
import { makeBundle } from '@endo/compartment-mapper/bundle.js';
import { fileURLToPath, pathToFileURL } from 'url';

const parentDirectory = new URL('..', import.meta.url).href;

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
    new URL('./ses-shims.js', import.meta.url).href,
    {
      tags: new Set(['xs']),
    },
  );

  await fs.mkdir(fileURLToPath(new URL('../tmp', import.meta.url)), {
    recursive: true,
  });
  await write(
    new URL('../tmp/ses-xs-prelude.js', import.meta.url).href,
    xsPrelude,
  );
};

main().catch(err => {
  console.error('Error running main:', err);
  process.exitCode = 1;
});
