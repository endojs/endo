/* global process, setTimeout, clearTimeout */
/* eslint-disable no-await-in-loop */

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
import open from 'open';

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
  makeRefIterator,
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
import bundleSource from '@endo/bundle-source';
import {
  makeReadPowers,
  makeWritePowers,
} from '@endo/compartment-mapper/node-powers.js';
import { makeNodeReader } from '@endo/stream-node';
import { E } from '@endo/far';

const readPowers = makeReadPowers({ fs, url, crypto });
const writePowers = makeWritePowers({ fs, url });
const { write } = writePowers;

const collect = (value, values) => values.concat([value]);

const packageDescriptorPath = url.fileURLToPath(
  new URL('../package.json', import.meta.url),
);

const textEncoder = new TextEncoder();

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

const delay = async (ms, cancelled) => {
  // Do not attempt to set up a timer if already cancelled.
  await Promise.race([cancelled, undefined]);
  return new Promise((resolve, reject) => {
    const handle = setTimeout(resolve, ms);
    cancelled.catch(error => {
      reject(error);
      clearTimeout(handle);
    });
  });
};

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
  program.name('endo').version(packageDescriptor.version);

  const where = program
    .command('where')
    .description('prints paths for state, logs, caches, socket, pids');

  where
    .command('state')
    .description('prints the state directory path')
    .action(async _cmd => {
      process.stdout.write(`${statePath}\n`);
    });

  where
    .command('run')
    .description('prints the daemon PID file path')
    .action(async _cmd => {
      process.stdout.write(`${ephemeralStatePath}\n`);
    });

  where
    .command('sock')
    .description('prints the UNIX domain socket or Windows named pipe path')
    .action(async _cmd => {
      process.stdout.write(`${sockPath}\n`);
    });

  where
    .command('log')
    .description('prints the log file path')
    .action(async _cmd => {
      process.stdout.write(`${logPath}\n`);
    });

  where
    .command('cache')
    .description('prints the cache directory path')
    .action(async _cmd => {
      process.stdout.write(`${cachePath}\n`);
    });

  program
    .command('start')
    .description('start the endo daemon')
    .action(async _cmd => {
      await start();
    });

  program
    .command('stop')
    .description('stop the endo daemon')
    .action(async _cmd => {
      await stop();
    });

  program
    .command('restart')
    .description('stop and start the daemon')
    .action(async _cmd => {
      await restart();
    });

  program
    .command('clean')
    .description('erases ephemeral state')
    .action(async _cmd => {
      await clean();
    });

  program
    .command('reset')
    .description('erases persistent state and restarts if running')
    .action(async _cmd => {
      await reset();
    });

  program
    .command('log')
    .option('-f, --follow', 'follow the tail of the log')
    .option('-p,--ping <interval>', 'milliseconds between daemon reset checks')
    .description('writes out the daemon log, optionally following updates')
    .action(async cmd => {
      const follow = cmd.opts().follow;
      const ping = cmd.opts().ping;
      const logCheckIntervalMs = ping !== undefined ? Number(ping) : 5_000;

      do {
        // Scope cancellation and propagate.
        const { promise: followCancelled, reject: cancelFollower } =
          makePromiseKit();
        cancelled.catch(cancelFollower);

        (async () => {
          const { getBootstrap } = await makeEndoClient(
            'log-follower-probe',
            sockPath,
            followCancelled,
          );
          const bootstrap = await getBootstrap();
          for (;;) {
            await delay(logCheckIntervalMs, followCancelled);
            await E(bootstrap).ping();
          }
        })().catch(cancelFollower);

        await new Promise((resolve, reject) => {
          const args = follow ? ['-f'] : [];
          const child = spawn('tail', [...args, logPath], {
            stdio: ['inherit', 'inherit', 'inherit'],
          });
          child.on('error', reject);
          child.on('exit', resolve);
          followCancelled.catch(() => {
            child.kill();
          });
        });

        if (follow) {
          await delay(logCheckIntervalMs, cancelled);
        }
      } while (follow);
    });

  program
    .command('ping')
    .description('prints ok if the daemon is responsive')
    .action(async _cmd => {
      const { getBootstrap } = await makeEndoClient(
        'health-checker',
        sockPath,
        cancelled,
      );
      const bootstrap = getBootstrap();
      await E(bootstrap).ping();
      process.stderr.write('ok\n');
    });

  program
    .command('map <application-path>')
    .description(
      'prints a compartment-map.json for the path to an entry module path',
    )
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
    .description(
      'prints the SHA-512 of the compartment-map.json for the path to an entry module path',
    )
    .action(async (_cmd, [applicationPath]) => {
      const applicationLocation = url.pathToFileURL(applicationPath);
      const sha512 = await hashLocation(readPowers, applicationLocation);
      process.stdout.write(`${sha512}\n`);
    });

  program
    .command('hash-archive <archive-path>')
    .description(
      'prints the SHA-512 of the compartment-map.json of an archive generated from the entry module path',
    )
    .action(async (_cmd, [archivePath]) => {
      const archiveLocation = url.pathToFileURL(archivePath);
      const { sha512 } = await loadArchive(readPowers, archiveLocation);
      process.stdout.write(`${sha512}\n`);
    });

  program
    .command('archive <application-path>')
    .option('-i,--inbox <inbox>', 'An alternate inbox', collect, [])
    .option('-n,--name <name>', 'Store the archive into Endo')
    .option('-f,--file <archive-path>', 'Store the archive into a file')
    .description('captures an archive from an entry module path')
    .action(async (applicationPath, cmd) => {
      const {
        name: archiveName,
        file: archivePath,
        inbox: inboxNames,
      } = cmd.opts();
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
          let inbox = E(bootstrap).inbox();
          for (const inboxName of inboxNames) {
            inbox = E(inbox).provide(inboxName);
          }
          await E(inbox).store(readerRef, archiveName);
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
    .command('bundle <application-path>')
    .option('-i,--inbox <inbox>', 'An alternate inbox', collect, [])
    .option('-n,--name <name>', 'Store the bundle into Endo')
    .description(
      'captures a JSON bundle containing an archive for an entry module path',
    )
    .action(async (applicationPath, cmd) => {
      const { name: bundleName, inbox: inboxNames } = cmd.opts();
      const bundle = await bundleSource(applicationPath);
      console.log(bundle.endoZipBase64Sha512);
      const bundleText = JSON.stringify(bundle);
      const bundleBytes = textEncoder.encode(bundleText);
      const readerRef = makeReaderRef([bundleBytes]);
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let inbox = E(bootstrap).inbox();
        for (const inboxName of inboxNames) {
          inbox = E(inbox).provide(inboxName);
        }
        await E(inbox).store(readerRef, bundleName);
      } catch (error) {
        console.error(error);
        cancel(error);
      }
    });

  program
    .command('store <path>')
    .option('-i,--inbox <inbox>', 'An alternate inbox', collect, [])
    .option(
      '-n,--name <name>',
      'Assigns a pet name to the result for future reference',
    )
    .description('stores a readable file')
    .action(async (storablePath, cmd) => {
      const { name, inbox: inboxNames } = cmd.opts();
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
        let inbox = E(bootstrap).inbox();
        for (const inboxName of inboxNames) {
          inbox = E(inbox).provide(inboxName);
        }
        await E(inbox).store(readerRef, name);
      } catch (error) {
        console.error(error);
        cancel(error);
      }
    });

  program
    .command('spawn [names...]')
    .description('creates workers for evaluating or importing programs')
    .option('-i,--inbox <inbox>', 'An alternate inbox', collect, [])
    .action(async (petNames, cmd) => {
      const { inbox: inboxNames } = cmd.opts();
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let inbox = E(bootstrap).inbox();
        for (const inboxName of inboxNames) {
          inbox = E(inbox).provide(inboxName);
        }
        for (const petName of petNames) {
          await E(inbox).makeWorker(petName);
        }
      } catch (error) {
        console.error(error);
        cancel(error);
      }
    });

  program
    .command('show <name>')
    .option('-i,--inbox <inbox>', 'An alternate inbox', collect, [])
    .description('prints the named value')
    .action(async (name, cmd) => {
      const { inbox: inboxNames } = cmd.opts();
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let inbox = E(bootstrap).inbox();
        for (const inboxName of inboxNames) {
          inbox = E(inbox).provide(inboxName);
        }
        const pet = await E(inbox).provide(name);
        console.log(pet);
      } catch (error) {
        console.error(error);
        cancel(error);
      }
    });

  program
    .command('follow <name>')
    .option('-i,--inbox <inbox>', 'An alternate inbox', collect, [])
    .description(
      'prints a representation of each value from the named async iterable as it arrives',
    )
    .action(async (name, cmd) => {
      const { inbox: inboxNames } = cmd.opts();
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let inbox = E(bootstrap).inbox();
        for (const inboxName of inboxNames) {
          inbox = E(inbox).provide(inboxName);
        }
        const iterable = await E(inbox).provide(name);
        for await (const iterand of makeRefIterator(iterable)) {
          console.log(iterand);
        }
      } catch (error) {
        console.error(error);
        cancel(error);
      }
    });

  program
    .command('cat <name>')
    .option('-i,--inbox <inbox>', 'An alternate inbox', collect, [])
    .description('prints the content of the named readable file')
    .action(async (name, cmd) => {
      const { inbox: inboxNames } = cmd.opts();
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let inbox = E(bootstrap).inbox();
        for (const inboxName of inboxNames) {
          inbox = E(inbox).provide(inboxName);
        }
        const readable = await E(inbox).provide(name);
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
    .command('list')
    .option('-i,--inbox <inbox>', 'An alternate inbox', collect, [])
    .description('lists pet names')
    .action(async cmd => {
      const { inbox: inboxNames } = cmd.opts();
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let inbox = E(bootstrap).inbox();
        for (const inboxName of inboxNames) {
          inbox = E(inbox).provide(inboxName);
        }
        const petNames = await E(inbox).list();
        for await (const petName of petNames) {
          console.log(petName);
        }
      } catch (error) {
        console.error(error);
        cancel(error);
      }
    });

  program
    .command('remove [names...]')
    .description('removes pet names')
    .option('-i,--inbox <inbox>', 'An alternate inbox', collect, [])
    .action(async (petNames, cmd) => {
      const { inbox: inboxNames } = cmd.opts();
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let inbox = E(bootstrap).inbox();
        for (const inboxName of inboxNames) {
          inbox = E(inbox).provide(inboxName);
        }
        await Promise.all(petNames.map(petName => E(inbox).remove(petName)));
      } catch (error) {
        console.error(error);
        cancel(error);
      }
    });

  program
    .command('rename <from> <to>')
    .description('renames a value')
    .option('-i,--inbox <inbox>', 'An alternate inbox', collect, [])
    .action(async (fromName, toName, cmd) => {
      const { inbox: inboxNames } = cmd.opts();
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let inbox = E(bootstrap).inbox();
        for (const inboxName of inboxNames) {
          inbox = E(inbox).provide(inboxName);
        }
        await E(inbox).rename(fromName, toName);
      } catch (error) {
        console.error(error);
        cancel(error);
      }
    });

  program
    .command('make-inbox <name>')
    .option('-i,--inbox <inbox>', 'An alternate inbox', collect, [])
    .description('creates a new inbox')
    .action(async (name, cmd) => {
      const { inbox: inboxNames } = cmd.opts();
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let inbox = E(bootstrap).inbox();
        for (const inboxName of inboxNames) {
          inbox = E(inbox).provide(inboxName);
        }
        const newInbox = await E(inbox).makeInbox(name);
        console.log(newInbox);
      } catch (error) {
        console.error(error);
        cancel(error);
      }
    });

  program
    .command('make-outbox <name>')
    .option('-i,--inbox <inbox>', 'An alternate inbox', collect, [])
    .description('creates a new outbox')
    .action(async (name, cmd) => {
      const { inbox: inboxNames } = cmd.opts();
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let inbox = E(bootstrap).inbox();
        for (const inboxName of inboxNames) {
          inbox = E(inbox).provide(inboxName);
        }
        const newOutbox = await E(inbox).makeOutbox(name);
        console.log(newOutbox);
      } catch (error) {
        console.error(error);
        cancel(error);
      }
    });

  program
    .command('inbox')
    .option('-i,--inbox <inbox>', 'An alternate inbox', collect, [])
    .option('-f,--follow', 'Follow the inbox for messages as they arrive')
    .description('prints pending requests that have been sent to you')
    .action(async cmd => {
      const { inbox: inboxNames, follow } = cmd.opts();
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let inbox = E(bootstrap).inbox();
        for (const inboxName of inboxNames) {
          inbox = E(inbox).provide(inboxName);
        }
        const requests = follow
          ? makeRefIterator(E(inbox).followMessages())
          : await E(inbox).listMessages();
        for await (const { number, who, what } of requests) {
          if (who !== undefined) {
            // TODO ensure the description is all printable ASCII and so
            // contains no TTY control codes.
            console.log(`${number}. ${who}: ${what}`);
          }
        }
      } catch (error) {
        console.error(error);
        cancel(error);
      }
    });

  program
    .command('request <outbox-name> <informal-description>')
    .description('requests a reference with the given description')
    .option('-i,--inbox <inbox>', 'An alternate inbox', collect, [])
    .option(
      '-n,--name <name>',
      'Assigns a name to the result for future reference, persisted between restarts',
    )
    .option('-w,--wait', 'Waits for and prints the response')
    .action(async (outboxName, description, cmd) => {
      const { name: resultPetName, inbox: inboxNames, wait } = cmd.opts();
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let inbox = E(bootstrap).inbox();
        for (const inboxName of inboxNames) {
          inbox = E(inbox).provide(inboxName);
        }
        const outboxP = E(inbox).provide(outboxName);
        const resultP = E(outboxP).request(description, resultPetName);
        if (wait || resultPetName === undefined) {
          const result = await resultP;
          console.log(result);
        }
      } catch (error) {
        console.error(error);
        cancel(error);
      }
    });

  program
    .command('resolve <request-number> <resolution-name>')
    .option('-i,--inbox <inbox>', 'An alternate inbox', collect, [])
    .description('responds to a pending request with the named value')
    .action(async (requestNumberText, resolutionName, cmd) => {
      const { inbox: inboxNames } = cmd.opts();
      // TODO less bad number parsing.
      const requestNumber = Number(requestNumberText);
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let inbox = E(bootstrap).inbox();
        for (const inboxName of inboxNames) {
          inbox = E(inbox).provide(inboxName);
        }
        await E(inbox).resolve(requestNumber, resolutionName);
      } catch (error) {
        console.error(error);
        cancel(error);
      }
    });

  program
    .command('reject <request-number> [message]')
    .description('responds to a pending request with the rejection message')
    .option('-i,--inbox <inbox>', 'An alternate inbox', collect, [])
    .action(async (requestNumberText, message, cmd) => {
      const { inbox: inboxNames } = cmd.opts();
      // TODO less bad number parsing.
      const requestNumber = Number(requestNumberText);
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let inbox = E(bootstrap).inbox();
        for (const inboxName of inboxNames) {
          inbox = E(inbox).provide(inboxName);
        }
        await E(inbox).reject(requestNumber, message);
      } catch (error) {
        console.error(error);
        cancel(error);
      }
    });

  program
    .command('eval <source> [names...]')
    .description('evaluates a string with the endowed values in scope')
    .option('-i,--inbox <inbox>', 'An alternate inbox', collect, [])
    .option(
      '-w,--worker <worker>',
      'Reuse an existing worker rather than create a new one',
    )
    .option(
      '-n,--name <name>',
      'Assigns a name to the result for future reference, persisted between restarts',
    )
    .action(async (source, names, cmd) => {
      const {
        name: resultPetName,
        worker: workerPetName,
        inbox: inboxNames,
      } = cmd.opts();
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let inbox = E(bootstrap).inbox();
        for (const inboxName of inboxNames) {
          inbox = E(inbox).provide(inboxName);
        }

        const pairs = names.map(name => {
          const pair = name.split(':');
          if (pair.length === 1) {
            return [name, name];
          }
          return pair;
        });
        const codeNames = pairs.map(pair => pair[0]);
        const petNames = pairs.map(pair => pair[1]);

        const result = await E(inbox).evaluate(
          workerPetName,
          source,
          codeNames,
          petNames,
          resultPetName,
        );
        console.log(result);
      } catch (error) {
        console.error(error);
        cancel(error);
      }
    });

  program
    .command('import-unsafe <path> <guest>')
    .description(
      'imports the module at the given path and runs its endow function with all of your authority',
    )
    .option('-i,--inbox <inbox>', 'An alternate inbox', collect, [])
    .option(
      '-n,--name <name>',
      'Assigns a name to the result for future reference, persisted between restarts',
    )
    .option(
      '-w,--worker <worker>',
      'Reuse an existing worker rather than create a new one',
    )
    .action(async (importPath, outboxPetName, cmd) => {
      const {
        name: resultPetName,
        worker: workerPetName,
        inboxNames,
      } = cmd.opts();
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let inbox = E(bootstrap).inbox();
        for (const inboxName of inboxNames) {
          inbox = E(inbox).provide(inboxName);
        }
        const result = await E(inbox).importUnsafeAndEndow(
          workerPetName,
          path.resolve(importPath),
          outboxPetName,
          resultPetName,
        );
        console.log(result);
      } catch (error) {
        console.error(error);
        cancel(error);
      }
    });

  program
    .command('import-bundle <readableBundleName> <guestName>')
    .description(
      'imports the named bundle in a confined space within a worker and runs its endow without any initial authority',
    )
    .option('-i,--inbox <inbox>', 'An alternate inbox', collect, [])
    .option(
      '-n,--name <name>',
      'Assigns a name to the result for future reference, persisted between restarts',
    )
    .option(
      '-w,--worker <worker>',
      'Reuse an existing worker rather than create a new one',
    )
    .action(async (readableBundleName, outboxName, cmd) => {
      const {
        name: resultPetName,
        worker: workerPetName,
        inbox: inboxNames,
      } = cmd.opts();
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let inbox = E(bootstrap).inbox();
        for (const inboxName of inboxNames) {
          inbox = E(inbox).provide(inboxName);
        }
        const result = await E(inbox).importBundleAndEndow(
          workerPetName,
          readableBundleName,
          outboxName,
          resultPetName,
        );
        console.log(result);
      } catch (error) {
        console.error(error);
        cancel(error);
      }
    });

  program
    .command('open <webPageName>')
    .description('opens a web page')
    .option('-i,--inbox <inbox>', 'An alternate inbox', collect, [])
    .option('-b,--bundle <bundle>', 'Bundle for a web page to open')
    .option('-f,--file <file>', 'Build the named bundle from JavaScript file')
    .option('-g,--guest <endowment>', 'Endowment to give the web page')
    .option('-h,--host', 'Endow the web page with the powers of the host')
    .action(async (webPageName, cmd) => {
      const {
        inbox: inboxNames,
        file: programPath,
        bundle: bundleName,
        guest: guestName,
        host: endowHost,
      } = cmd.opts();
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );

      /** @type {import('@endo/eventual-send').ERef<import('@endo/stream').Reader<string>> | undefined} */
      let bundleReaderRef;
      if (programPath !== undefined) {
        if (bundleName === undefined) {
          // TODO come up with something for a temporary reference.
          // Maybe expose a nonce.
          throw new Error('bundle name is required for page from file');
        }
        const bundle = await bundleSource(programPath);
        console.log(bundle.endoZipBase64Sha512);
        const bundleText = JSON.stringify(bundle);
        const bundleBytes = textEncoder.encode(bundleText);
        bundleReaderRef = makeReaderRef([bundleBytes]);
      }

      try {
        const bootstrap = getBootstrap();
        let inbox = E(bootstrap).inbox();
        for (const inboxName of inboxNames) {
          inbox = E(inbox).provide(inboxName);
        }

        // Prepare a bundle, with the given name.
        if (bundleReaderRef !== undefined) {
          await E(inbox).store(bundleReaderRef, bundleName);
        }

        /** @type {string | undefined} */
        let webPageUrl;
        if (guestName !== undefined && endowHost) {
          throw new Error('choose either guest or host endowment, not both');
        } else if (
          bundleName !== undefined &&
          (guestName !== undefined || endowHost)
        ) {
          ({ url: webPageUrl } = await E(inbox).provideWebPage(
            webPageName,
            bundleName,
            guestName, // undefined if endowHost
          ));
        } else if (bundleName === undefined && guestName === undefined) {
          ({ url: webPageUrl } = await E(inbox).provide(webPageName));
        } else if (webPageUrl === undefined) {
          // webPageUrl will always be undefined if we fall through to here,
          // but calling it out helps narrow the type below.
          throw new Error('both or neither bundle and endowment required');
        }
        console.log(webPageUrl);
        open(webPageUrl);
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
