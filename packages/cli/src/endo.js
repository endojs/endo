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
import { start, stop, restart, clean, reset } from '@endo/daemon';
import {
  whereEndoState,
  whereEndoEphemeralState,
  whereEndoSock,
  whereEndoCache,
} from '@endo/where';

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
      await logCommand({ follow, ping });
    });

  program
    .command('ping')
    .description('prints ok if the daemon is responsive')
    .action(async _cmd => {
      const { ping } = await import('./ping.js');
      await ping();
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
      return spawn({ petNames, partyNames });
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
      return show({ name, partyNames });
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
      const { followCommand } = await import('./follow.js');
      return followCommand({ name, partyNames });
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
      const { cat } = await import('./cat.js');
      return cat({ name, partyNames });
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
      const { list } = await import('./list.js');
      return list({ partyNames });
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
      const { remove } = await import('./remove.js');
      return remove({ petNames, partyNames });
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
      const { rename } = await import('./rename.js');
      return rename({ fromName, toName, partyNames });
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
      const { mkhost } = await import('./mkhost.js');
      return mkhost({ name, partyNames });
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
      const { mkguest } = await import('./mkguest.js');
      return mkguest({ name, partyNames });
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
      const { inbox } = await import('./inbox.js');
      return inbox({ follow, partyNames });
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
      const { request } = await import('./request.js');
      return request({ description, resultName, partyNames });
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
      const { resolveCommand } = await import('./resolve.js');
      return resolveCommand({
        requestNumberText,
        resolutionName,
        partyNames,
      });
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
      const { rejectCommand } = await import('./reject.js');
      return rejectCommand({
        requestNumberText,
        message,
        partyNames,
      });
    });

  program
    .command('send <party> <message with embedded references>')
    .description('delivers a message to the underlying host')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .action(async (partyName, message, cmd) => {
      const { as: partyNames } = cmd.opts();
      const { send } = await import('./send.js');
      return send({ message, partyName, partyNames });
    });

  program
    .command('receive <message with embedded references>')
    .description('delivers a message to the underlying host')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .action(async (message, cmd) => {
      const { as: partyNames } = cmd.opts();
      const { receive } = await import('./receive.js');
      return receive({ message, partyNames });
    });

  program
    .command('adopt <message-number> <name-in-message>')
    .option(
      '-n,--name <name>',
      'Name to use, if different than the suggested name.',
    )
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .description('Adopts a name from a received message')
    .action(async (messageNumberText, edgeName, cmd) => {
      const { name = edgeName, as: partyNames } = cmd.opts();
      const { adoptCommand } = await import('./adopt.js');
      return adoptCommand({
        messageNumberText,
        edgeName,
        name,
        partyNames,
      });
    });

  program
    .command('dismiss <message-number>')
    .description('dismisses a message and drops any references it carried')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .action(async (messageNumberText, cmd) => {
      const { as: partyNames } = cmd.opts();
      const { dismissCommand } = await import('./dismiss.js');
      return dismissCommand({
        messageNumberText,
        partyNames,
      });
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
      const { evalCommand } = await import('./eval.js');
      return evalCommand({
        source,
        names,
        resultName,
        workerName,
        partyNames,
      });
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
  } catch (e) {
    if (e && e.name === 'CommanderError') {
      return e.exitCode;
    }
    throw e;
  }
  return 0;
};
