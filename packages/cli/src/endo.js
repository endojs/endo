/* global process */
/* eslint-disable no-await-in-loop */

// Establish a perimeter:
import 'ses';
import '@endo/eventual-send/shim.js';
import '@endo/lockdown/commit.js';

import fs from 'fs';
import path from 'path';
import url from 'url';
import os from 'os';

import { Command } from 'commander';
import { makePromiseKit } from '@endo/promise-kit';
import {
  start,
  stop,
  restart,
  clean,
  reset,
  makeRefIterator,
  makeRefReader,
} from '@endo/daemon';
import {
  whereEndoState,
  whereEndoEphemeralState,
  whereEndoSock,
  whereEndoCache,
} from '@endo/where';
import { E } from '@endo/far';

import { provideEndoClient } from './client.js';

const collect = (value, values) => values.concat([value]);

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
      const { follow, ping } = cmd.opts();
      const { log: logCommand } = await import('./log.js');
      return logCommand({
        cancel,
        cancelled,
        sockPath,
        follow,
        ping,
      });
    });

  program
    .command('ping')
    .description('prints ok if the daemon is responsive')
    .action(async _cmd => {
      const { ping } = await import('./ping.js');
      return ping({
        cancelled,
        sockPath,
      });
    });

  program
    .command('bundle <application-path>')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .option('-n,--name <name>', 'Store the bundle into Endo')
    .description(
      'captures a JSON bundle containing an archive for an entry module path',
    )
    .action(async (applicationPath, cmd) => {
      const { name: bundleName, as: partyNames } = cmd.opts();
      const { bundleCommand } = await import('./bundle.js');
      return bundleCommand({
        cancel,
        cancelled,
        sockPath,
        applicationPath,
        bundleName,
        partyNames,
      });
    });

  program
    .command('store <path>')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .option(
      '-n,--name <name>',
      'Assigns a pet name to the result for future reference',
    )
    .description('stores a readable file')
    .action(async (storablePath, cmd) => {
      const { name, as: partyNames } = cmd.opts();
      const { store } = await import('./store.js');
      return store({
        cancel,
        cancelled,
        sockPath,
        storablePath,
        name,
        partyNames,
      });
    });

  program
    .command('spawn [names...]')
    .description('creates workers for evaluating or importing programs')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .action(async (petNames, cmd) => {
      const { as: partyNames } = cmd.opts();
      const { spawn } = await import('./spawn.js');
      return spawn({
        cancel,
        cancelled,
        sockPath,
        petNames,
        partyNames,
      });
    });

  program
    .command('show <name>')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .description('prints the named value')
    .action(async (name, cmd) => {
      const { as: partyNames } = cmd.opts();
      const { show } = await import('./show.js');
      return show({
        cancel,
        cancelled,
        sockPath,
        name,
        partyNames,
      });
    });

  program
    .command('follow <name>')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .description(
      'prints a representation of each value from the named async iterable as it arrives',
    )
    .action(async (name, cmd) => {
      const { as: partyNames } = cmd.opts();
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let party = E(bootstrap).host();
        for (const partyName of partyNames) {
          party = E(party).provide(partyName);
        }
        const iterable = await E(party).provide(name);
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
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .description('prints the content of the named readable file')
    .action(async (name, cmd) => {
      const { as: partyNames } = cmd.opts();
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let party = E(bootstrap).host();
        for (const partyName of partyNames) {
          party = E(party).provide(partyName);
        }
        const readable = await E(party).provide(name);
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
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .description('lists pet names')
    .action(async cmd => {
      const { as: partyNames } = cmd.opts();
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let party = E(bootstrap).host();
        for (const partyName of partyNames) {
          party = E(party).provide(partyName);
        }
        const petNames = await E(party).list();
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
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .action(async (petNames, cmd) => {
      const { as: partyNames } = cmd.opts();
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let party = E(bootstrap).host();
        for (const partyName of partyNames) {
          party = E(party).provide(partyName);
        }
        await Promise.all(petNames.map(petName => E(party).remove(petName)));
      } catch (error) {
        console.error(error);
        cancel(error);
      }
    });

  program
    .command('rename <from> <to>')
    .description('renames a value')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .action(async (fromName, toName, cmd) => {
      const { as: partyNames } = cmd.opts();
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let party = E(bootstrap).host();
        for (const partyName of partyNames) {
          party = E(party).provide(partyName);
        }
        await E(party).rename(fromName, toName);
      } catch (error) {
        console.error(error);
        cancel(error);
      }
    });

  program
    .command('mkhost <name>')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .description('creates new host powers, pet store, and mailbox')
    .action(async (name, cmd) => {
      const { as: partyNames } = cmd.opts();
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let party = E(bootstrap).host();
        for (const partyName of partyNames) {
          party = E(party).provide(partyName);
        }
        const newHost = await E(party).provideHost(name);
        console.log(newHost);
      } catch (error) {
        console.error(error);
        cancel(error);
      }
    });

  program
    .command('mkguest <name>')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .description('creates new guest powers, pet store, and mailbox')
    .action(async (name, cmd) => {
      const { as: partyNames } = cmd.opts();
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let party = E(bootstrap).host();
        for (const partyName of partyNames) {
          party = E(party).provide(partyName);
        }
        const newGuest = await E(party).provideGuest(name);
        console.log(newGuest);
      } catch (error) {
        console.error(error);
        cancel(error);
      }
    });

  program
    .command('inbox')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .option('-f,--follow', 'Follow the inbox for messages as they arrive')
    .description('prints pending requests that have been sent to you')
    .action(async cmd => {
      const { as: partyNames, follow } = cmd.opts();
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let party = E(bootstrap).host();
        for (const partyName of partyNames) {
          party = E(party).provide(partyName);
        }
        const messages = follow
          ? makeRefIterator(E(party).followMessages())
          : await E(party).listMessages();
        for await (const message of messages) {
          const { number, who, when } = message;
          if (message.type === 'request') {
            const { what } = message;
            console.log(
              `${number}. ${JSON.stringify(who)} requested ${JSON.stringify(
                what,
              )} at ${JSON.stringify(when)}`,
            );
          } else {
            console.log(
              `${number}. ${JSON.stringify(
                who,
              )} sent an unrecognizable message at ${JSON.stringify(
                when,
              )}. Consider upgrading.`,
            );
          }
        }
      } catch (error) {
        console.error(error);
        cancel(error);
      }
    });

  program
    .command('request <informal-description>')
    .description('requests a reference with the given description')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .option(
      '-n,--name <name>',
      'Assigns a name to the result for future reference, persisted between restarts',
    )
    .action(async (description, cmd) => {
      const { name: resultName, as: partyNames } = cmd.opts();
      if (partyNames.length === 0) {
        console.error('Specify the name of a guest with -a or --as <guest>');
        process.exitCode = 1;
        return;
      }
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let party = E(bootstrap).host();
        for (const partyName of partyNames) {
          party = E(party).provideGuest(partyName);
        }
        const result = await E(party).request(description, resultName);
        console.log(result);
      } catch (error) {
        console.error(error);
        cancel(error);
      }
    });

  program
    .command('resolve <request-number> <resolution-name>')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .description('responds to a pending request with the named value')
    .action(async (requestNumberText, resolutionName, cmd) => {
      const { as: partyNames } = cmd.opts();
      // TODO less bad number parsing.
      const requestNumber = Number(requestNumberText);
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let party = E(bootstrap).host();
        for (const partyName of partyNames) {
          party = E(party).provide(partyName);
        }
        await E(party).resolve(requestNumber, resolutionName);
      } catch (error) {
        console.error(error);
        cancel(error);
      }
    });

  program
    .command('reject <request-number> [message]')
    .description('responds to a pending request with the rejection message')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .action(async (requestNumberText, message, cmd) => {
      const { as: partyNames } = cmd.opts();
      // TODO less bad number parsing.
      const requestNumber = Number(requestNumberText);
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let party = E(bootstrap).host();
        for (const partyName of partyNames) {
          party = E(party).provide(partyName);
        }
        await E(party).reject(requestNumber, message);
      } catch (error) {
        console.error(error);
        cancel(error);
      }
    });

  program
    .command('eval <source> [names...]')
    .description('evaluates a string with the endowed values in scope')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
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
        name: resultName,
        worker: workerName = 'MAIN',
        as: partyNames,
      } = cmd.opts();
      const { getBootstrap } = await provideEndoClient(
        'cli',
        sockPath,
        cancelled,
      );
      try {
        const bootstrap = getBootstrap();
        let party = E(bootstrap).host();
        for (const partyName of partyNames) {
          party = E(party).provide(partyName);
        }

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

        const result = await E(party).evaluate(
          workerName,
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

  program
    .command('make [file]')
    .description('Makes a plugin or a worker caplet (worklet)')
    .option('-b,--bundle <bundle>', 'Bundle for a web page to open')
    .option('--UNSAFE <file>', 'Path to a Node.js module')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .option('-p,--powers <name>', 'Name of powers to grant or NONE, HOST, ENDO')
    .option(
      '-n,--name <name>',
      'Assigns a name to the result for future reference, persisted between restarts',
    )
    .option(
      '-w,--worker <worker>',
      'Reuse an existing worker rather than create a new one',
    )
    .action(async (filePath, cmd) => {
      const {
        UNSAFE: importPath,
        name: resultName,
        bundle: bundleName,
        worker: workerName = 'NEW',
        as: partyNames,
        powers: powersName = 'NONE',
      } = cmd.opts();
      const { makeCommand } = await import('./make.js');
      return makeCommand({
        cancel,
        cancelled,
        sockPath,
        filePath,
        importPath,
        resultName,
        bundleName,
        workerName,
        partyNames,
        powersName,
      });
    });

  program
    .command('open <webPageName> [filePath]')
    .description('opens a web page')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .option('-b,--bundle <bundle>', 'Bundle for a web page to open')
    .option(
      '-p,--powers <endowment>',
      'Endowment to give the weblet (a name, NONE, HOST, or ENDO)',
    )
    .action(async (webPageName, programPath, cmd) => {
      const {
        bundle: bundleName,
        powers: powersName = 'NONE',
        as: partyNames,
      } = cmd.opts();
      const { open } = await import('./open.js');
      return open({
        cancel,
        cancelled,
        sockPath,
        webPageName,
        programPath,
        bundleName,
        powersName,
        partyNames,
      });
    });

  program
    .command('run [<file>] [<args>...]')
    .description(
      'import a caplet to run at the CLI (runlet), endow it with capabilities, make and store its public API',
    )
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .option('-b,--bundle <bundle>', 'Bundle name for the caplet program')
    .option('--UNSAFE <path>', 'Or path of an unsafe plugin to run in Node.js')
    .option(
      '-p,--powers <endowment>',
      'Endowment to give the worklet (a name, NONE, HOST, or ENDO)',
    )
    .action(async (filePath, args, cmd) => {
      const {
        as: partyNames,
        bundle: bundleName,
        UNSAFE: importPath,
        powers: powersName = 'NONE',
      } = cmd.opts();
      const { run } = await import('./run.js');
      return run({
        cancel,
        cancelled,
        sockPath,
        filePath,
        args,
        bundleName,
        importPath,
        powersName,
        partyNames,
      });
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
