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
  makeReaderRef,
  makeRefReader,
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
  makeArchive,
  writeArchive,
} from '@endo/compartment-mapper';
import {
  makeReadPowers,
  makeWritePowers,
} from '@endo/compartment-mapper/node-powers.js';
import { makeNodeReader } from '@endo/stream-node';
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

const provideEndoClient = async (...args) => {
  try {
    // It is okay to fail to connect because the daemon is not running.
    return await makeEndoClient(...args);
  } catch {
    console.error('Starting Endo daemon...');
    // It is also okay to fail the race to start.
    await start().catch(() => {});
    // But not okay to fail to connect after starting.
    // We are not going to contemplate reliably in the face of a worker getting
    // stopped the moment after it was started.
    // That is a bridge too far.
    return makeEndoClient(...args);
  }
};

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

  program
    .command('log')
    .option('-f, --follow', 'follow the tail of the log')
    .action(async cmd => {
      // TODO rerun follower command after reset
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
    .command('archive <application-path>')
    .option('-n,--name <name>', 'Store the archive into Endo')
    .option('-f,--file <archive-path>', 'Store the archive into a file')
    .action(async (applicationPath, cmd) => {
      const archiveName = cmd.opts().name;
      const archivePath = cmd.opts().file;
      const applicationLocation = url.pathToFileURL(applicationPath);
      if (archiveName !== undefined) {
        const archiveBytes = await makeArchive(readPowers, applicationLocation);
        const readerRef = makeReaderRef([archiveBytes]);
        const { getBootstrap } = await provideEndoClient(
          'cli',
          sockPath,
          cancelled,
        );
        try {
          const bootstrap = getBootstrap();
          await E(bootstrap).store(readerRef, archiveName);
        } catch (error) {
          console.error(error);
          cancel(error);
        }
      } else if (archivePath !== undefined) {
        const archiveLocation = url.pathToFileURL(archivePath);
        await writeArchive(
          write,
          readPowers,
          archiveLocation,
          applicationLocation,
        );
      } else {
        throw new TypeError('Archive command requires either a name or a path');
      }
    });

  program
    .command('store <path>')
    .option(
      '-n,--name <name>',
      'Assigns a pet name to the result for future reference',
    )
    .action(async (storablePath, cmd) => {
      const { name } = cmd.opts();
      const nodeReadStream = fs.createReadStream(storablePath);
      const reader = makeNodeReader(nodeReadStream);
      const readerRef = makeReaderRef(reader);

      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        await E(bootstrap).store(readerRef, name);
      } catch (error) {
        console.error(error);
        cancel(error);
      }
    });

  program.command('spawn <name>').action(async name => {
    const { getBootstrap } = await provideEndoClient(
      'cli',
      sockPath,
      cancelled,
    );
    try {
      const bootstrap = getBootstrap();
      await E(bootstrap).makeWorker(name);
    } catch (error) {
      console.error(error);
      cancel(error);
    }
  });

  program.command('show <name>').action(async name => {
    const { getBootstrap } = await provideEndoClient(
      'cli',
      sockPath,
      cancelled,
    );
    try {
      const bootstrap = getBootstrap();
      const pet = await E(bootstrap).provide(name);
      console.log(pet);
    } catch (error) {
      console.error(error);
      cancel(error);
    }
  });

  program.command('cat <name>').action(async name => {
    const { getBootstrap } = await provideEndoClient(
      'cli',
      sockPath,
      cancelled,
    );
    try {
      const bootstrap = getBootstrap();
      const readable = await E(bootstrap).provide(name);
      const readerRef = E(readable).stream();
      const reader = makeRefReader(readerRef);
      for await (const chunk of reader) {
        process.stdout.write(chunk);
      }
    } catch (error) {
      console.error(error);
      cancel(error);
    }
  });

  program
    .command('eval <worker> <source> [names...]')
    .option(
      '-n,--name <name>',
      'Assigns a name to the result for future reference, persisted between restarts',
    )
    .action(async (worker, source, names, cmd) => {
      const { name: resultName } = cmd.opts();
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        const workerRef = E(bootstrap).provide(worker);

        const pairs = names.map(name => {
          /** @type {Array<string>} */
          const pair = name.split(':');
          if (pair.length === 1) {
            return [name, name];
          }
          if (pair.length > 2) {
            throw new Error(
              `Specify either a name endowmentName:pet-name, got: ${JSON.stringify(
                name,
              )}`,
            );
          }
          return pair;
        });
        const codeNames = pairs.map(pair => pair[0]);
        const endowmentNames = pairs.map(pair => pair[1]);

        const result = await E(workerRef).evaluate(
          source,
          codeNames,
          endowmentNames,
          resultName,
        );
        console.log(result);
      } catch (error) {
        console.error(error);
        cancel(error);
      }
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
