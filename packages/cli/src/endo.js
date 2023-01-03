/* global process */

// Establish a perimeter:
import 'ses';
import '@endo/eventual-send/shim.js';
import '@endo/lockdown/commit.js';

import fs from 'fs';
import path from 'path';
import url from 'url';
import crypto from 'crypto';
import { spawn } from 'child_process';
import os from 'os';

import { Command } from 'commander';
import { makePromiseKit } from '@endo/promise-kit';
import {
  start,
  stop,
  restart,
  clean,
  reset,
  makeEndoClient,
} from '@endo/daemon';
import {
  whereEndoState,
  whereEndoEphemeralState,
  whereEndoSock,
  whereEndoCache,
} from '@endo/where';
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
import { E } from '@endo/far';

const readPowers = makeReadPowers({ fs, url, crypto });
const writePowers = makeWritePowers({ fs, url });
const { write } = writePowers;

const packageDescriptorPath = url.fileURLToPath(
  new URL('../package.json', import.meta.url),
);

const { username, homedir } = os.userInfo();
const temp = os.tmpdir();
const info = {
  user: username,
  home: homedir,
  temp,
};

const statePath = whereEndoState(process.platform, process.env, info);
const ephemeralStatePath = whereEndoEphemeralState(
  process.platform,
  process.env,
  info,
);
const sockPath = whereEndoSock(process.platform, process.env, info);
const cachePath = whereEndoCache(process.platform, process.env, info);
const logPath = path.join(statePath, 'endo.log');

export const main = async rawArgs => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  cancelled.catch(() => {});
  process.once('SIGINT', () => cancel(Error('SIGINT')));

  const program = new Command();

  program.storeOptionsAsProperties(false);

  const packageDescriptorBytes = await fs.promises.readFile(
    packageDescriptorPath,
  );
  const packageDescriptor = JSON.parse(packageDescriptorBytes);
  program.name(packageDescriptor.name).version(packageDescriptor.version);

  const where = program.command('where');

  where.command('state').action(async _cmd => {
    process.stdout.write(`${statePath}\n`);
  });

  where.command('run').action(async _cmd => {
    process.stdout.write(`${ephemeralStatePath}\n`);
  });

  where.command('sock').action(async _cmd => {
    process.stdout.write(`${sockPath}\n`);
  });

  where.command('log').action(async _cmd => {
    process.stdout.write(`${logPath}\n`);
  });

  where.command('cache').action(async _cmd => {
    process.stdout.write(`${cachePath}\n`);
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

  program.command('reset').action(async _cmd => {
    await reset();
  });

  const log = program.command('log').action(async cmd => {
    await new Promise((resolve, reject) => {
      const args = cmd.opts().follow ? ['-f'] : [];
      const child = spawn('tail', [...args, logPath], {
        stdio: ['inherit', 'inherit', 'inherit'],
      });
      child.on('error', reject);
      child.on('exit', resolve);
      cancelled.catch(() => child.kill());
    });
  });

  log.option('-f, --follow', 'follow the tail of the log');

  program.command('ping').action(async _cmd => {
    const { getBootstrap } = await makeEndoClient(
      'health-checker',
      sockPath,
      cancelled,
    );
    const bootstrap = getBootstrap();
    await E(bootstrap).ping();
    process.stderr.write('ok\n');
  });

  program.command('map <application-path>').action(async applicationPath => {
    const applicationLocation = url.pathToFileURL(applicationPath);
    const compartmentMapBytes = await mapLocation(
      readPowers,
      applicationLocation,
    );
    process.stdout.write(compartmentMapBytes);
  });

  program.command('hash <application-path>').action(async applicationPath => {
    const applicationLocation = url.pathToFileURL(applicationPath);
    const sha512 = await hashLocation(readPowers, applicationLocation);
    process.stdout.write(`${sha512}\n`);
  });

  program.command('hash-archive <archive-path>').action(async archivePath => {
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
    await program.parseAsync(rawArgs, { from: 'user' });
    cancel(Error('normal termination'));
  } catch (e) {
    if (e && e.name === 'CommanderError') {
      return e.exitCode;
    }
    throw e;
  }
  return 0;
};
