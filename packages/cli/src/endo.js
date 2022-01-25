/* global process */
import fs from 'fs';
import url from 'url';
import crypto from 'crypto';

import { Command } from 'commander';
import { start, stop, restart, clean } from '@endo/daemon';
import { whereEndo, whereEndoSock, whereEndoLog } from '@endo/where';
import {
  mapLocation,
  hashLocation,
  loadArchive,
  writeArchive,
} from '@endo/compartment-mapper';
import {
  makeReadPowers,
  makeWritePowers,
} from '@endo/compartment-mapper/node-powers.js';

const readPowers = makeReadPowers({ fs, url, crypto });
const writePowers = makeWritePowers({ fs, url });
const { write } = writePowers;

const packageDescriptorPath = url.fileURLToPath(
  new URL('../package.json', import.meta.url),
);

const endoPath = whereEndo(process.platform, process.env);
const sockPath = whereEndoSock(process.platform, process.env);
const logPath = whereEndoLog(process.platform, process.env);

export const main = async rawArgs => {
  const program = new Command();

  program.storeOptionsAsProperties(false);

  const packageDescriptorBytes = await fs.promises.readFile(
    packageDescriptorPath,
  );
  const packageDescriptor = JSON.parse(packageDescriptorBytes);
  program.name(packageDescriptor.name).version(packageDescriptor.version);

  program.command('where').action(async _cmd => {
    console.log(endoPath);
  });

  program.command('wheresock').action(async _cmd => {
    console.log(sockPath);
  });

  program.command('wherelog').action(async _cmd => {
    console.log(logPath);
  });

  program.command('start').action(async _cmd => {
    await start();
  });

  program.command('stop').action(async _cmd => {
    await stop();
  });

  program.command('restart').action(async _cmd => {
    await restart();
  });

  program.command('clean').action(async _cmd => {
    await clean();
  });

  program
    .command('map <application-path>')
    .action(async (_cmd, [applicationPath]) => {
      const applicationLocation = url.pathToFileURL(applicationPath);
      const compartmentMapBytes = await mapLocation(
        readPowers,
        applicationLocation,
      );
      process.stdout.write(compartmentMapBytes);
    });

  program
    .command('hash <application-path>')
    .action(async (_cmd, [applicationPath]) => {
      const applicationLocation = url.pathToFileURL(applicationPath);
      const sha512 = await hashLocation(readPowers, applicationLocation);
      process.stdout.write(`${sha512}\n`);
    });

  program
    .command('hash-archive <archive-path>')
    .action(async (_cmd, [archivePath]) => {
      const archiveLocation = url.pathToFileURL(archivePath);
      const { sha512 } = await loadArchive(readPowers, archiveLocation);
      process.stdout.write(`${sha512}\n`);
    });

  program
    .command('archive <archive-path> <application-path>')
    .action(async (_cmd, [archivePath, applicationPath]) => {
      const archiveLocation = url.pathToFileURL(archivePath);
      const applicationLocation = url.pathToFileURL(applicationPath);
      await writeArchive(
        write,
        readPowers,
        archiveLocation,
        applicationLocation,
      );
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
