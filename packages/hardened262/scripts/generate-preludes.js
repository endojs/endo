// @ts-nocheck
/* global process */
import 'ses';
import fs from 'fs';
import crypto from 'crypto';
import { makeBundle } from '@endo/compartment-mapper/bundle.js';
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js';
import url, { fileURLToPath } from 'url';

const readPowers = makeReadPowers({ crypto, url, fs });

const write = async (location, content) => {
  const path = fileURLToPath(location);
  await fs.promises.writeFile(path, content);
};

const main = async () => {
  const xsPrelude = await makeBundle(
    readPowers,
    new URL('./ses-shims.js', import.meta.url).href,
    {
      conditions: new Set(['xs']),
    },
  );

  await fs.promises.mkdir(fileURLToPath(new URL('../tmp', import.meta.url)), {
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
