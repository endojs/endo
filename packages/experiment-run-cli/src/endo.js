/* global process */

// Establish a perimeter:
import 'ses';
// import '@endo/eventual-send/shim.js';
// import '@endo/lockdown/commit.js';

import fs from 'fs';
import url from 'url';
import crypto from 'crypto';

import { Command } from 'commander';

import {
  makeReadPowers,
  makeWritePowers,
} from '@endo/compartment-mapper/node-powers.js';
import { run } from './run.js';

const readPowers = makeReadPowers({ fs, url, crypto });

const packageDescriptorPath = url.fileURLToPath(
  new URL('../package.json', import.meta.url),
);

export const main = async rawArgs => {
  const program = new Command();

  // program.storeOptionsAsProperties(false);

  const packageDescriptorBytes = await fs.promises.readFile(
    packageDescriptorPath,
  );
  const packageDescriptor = JSON.parse(packageDescriptorBytes);
  program.name(packageDescriptor.name).version(packageDescriptor.version);



  program
    .command('run <file>')
    .option('--lockdown', 'enable lockdown', false)
    .option('--evasion', 'enable evasion transform', false)
    .option('--stingy', 'not be generous with endowments', false)
    .option('--lockdown-verbose', 'print extra information from lockdown; enables --lockdown too', false)
    .action(async (applicationEntrypoint, { lockdown, evasion, stingy, lockdownVerbose }, cmd) => {
      await run({
        path: applicationEntrypoint,
        readPowers,
        shouldLockdown: lockdown,
        verboseLockdown: lockdownVerbose,
        shouldUseEvasionTransform: evasion,
        shouldEndowAll: !stingy
      })
    });


  // Throw an error instead of exiting directly.
  program.exitOverride();

  try {
    await program.parse(rawArgs, { from: 'user' });
  } catch (e) {
    if (e && e.name === 'CommanderError') {
      return e.exitCode;
    }
    throw e;
  }
  return 0;
};
