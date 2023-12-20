/* global process */
/* eslint-disable no-await-in-loop */

// Establish a perimeter:
import 'ses';
import '@endo/eventual-send/shim.js';
import '@endo/lockdown/commit.js';

import fs from 'fs';
import url from 'url';

import { Command } from 'commander';

const collect = (value, values) => values.concat([value]);

const packageDescriptorPath = url.fileURLToPath(
  new URL('../package.json', import.meta.url),
);

export const main = async rawArgs => {
  const program = new Command();

  program.storeOptionsAsProperties(false);

  const packageDescriptorBytes = await fs.promises.readFile(
    packageDescriptorPath,
  );
  const packageDescriptor = JSON.parse(packageDescriptorBytes);
  program.name('endo').version(packageDescriptor.version);

  program
    .command('install <name> [filePath]')
    .description('installs a web page (weblet)')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .option('-b,--bundle <bundle>', 'Bundle for a web page (weblet)')
    .option(
      '-p,--powers <endowment>',
      'Endowment to give the weblet (a name, NONE, HOST, or ENDO)',
    )
    .option('-o,--open', 'Open the new web page immediately (weblet)')
    .action(async (webPageName, programPath, cmd) => {
      const {
        bundle: bundleName,
        powers: powersName = 'NONE',
        as: partyNames,
        open: doOpen,
      } = cmd.opts();
      const { install } = await import('./install.js');
      return install({
        doOpen,
        webPageName,
        programPath,
        bundleName,
        powersName,
        partyNames,
      });
    });

  program
    .command('open <name>')
    .description('opens a web page (weblet)')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .action(async (webPageName, cmd) => {
      const { as: partyNames } = cmd.opts();
      const { open } = await import('./open.js');
      return open({
        webPageName,
        partyNames,
      });
    });
  program
    .command('run [<file>] [<args>...]')
    .description('runs a program (runlet)')
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

  program
    .command('make [file]')
    .alias('mk')
    .description('make a plugin or a worker caplet (worklet)')
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
    .command('inbox')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .option('-f,--follow', 'Follow the inbox for messages as they arrive')
    .description('read messages')
    .action(async cmd => {
      const { as: partyNames, follow } = cmd.opts();
      const { inbox } = await import('./inbox.js');
      return inbox({ follow, partyNames });
    });

  program
    .command('request <informal-description>')
    .description('ask someone for something')
    .option(
      '-t,--to <party>',
      'Send the request to another party (default: HOST)',
    )
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
      const {
        name: resultName,
        as: partyNames,
        to: toName = 'HOST',
      } = cmd.opts();
      const { request } = await import('./request.js');
      return request({ toName, description, resultName, partyNames });
    });

  program
    .command('resolve <request-number> <resolution-name>')
    .description('grant a request')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
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
    .description('deny a request')
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
    .command('send <party> <message-with-embedded-references>')
    .description('send a message with @named-values @for-you:from-me')
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
    .description('adopt a @value from a message')
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
    .description('delete a message')
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
    .command('list [directory]')
    .alias('ls')
    .description('show names (dot delimited pet name path)')
    .option('-s,--special', 'show special names')
    .option('-a,--all', 'show all names')
    .action(async (directoryName, cmd) => {
      const { special, all } = cmd.opts();
      const { list } = await import('./list.js');
      return list({ directoryName, special, all });
    });

  program
    .command('remove [names...]')
    .alias('rm')
    .description('forget a named value')
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
    .description('change the name for a value')
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
    .command('move <from> <to>')
    .alias('mv')
    .description('move name from one path to another')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .action(async (fromPath, toPath, cmd) => {
      const { as: partyNames } = cmd.opts();
      const { move } = await import('./move.js');
      return move({ fromPath, toPath, partyNames });
    });

  program
    .command('copy <from> <to>')
    .alias('cp')
    .description('copy name from one path to another')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .action(async (fromPath, toPath, cmd) => {
      const { as: partyNames } = cmd.opts();
      const { copy } = await import('./copy.js');
      return copy({ fromPath, toPath, partyNames });
    });

  program
    .command('show <name>')
    .description('prints the named value')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
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
    .description('subscribe to a stream of values')
    .action(async (name, cmd) => {
      const { as: partyNames } = cmd.opts();
      const { followCommand } = await import('./follow.js');
      return followCommand({ name, partyNames });
    });

  program
    .command('cat <name>')
    .description('dumps a blob')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .action(async (name, cmd) => {
      const { as: partyNames } = cmd.opts();
      const { cat } = await import('./cat.js');
      return cat({ name, partyNames });
    });

  program
    .command('store <path>')
    .description('stores a blob')
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
    .command('eval <source> [names...]')
    .description('creates a value')
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
    .command('spawn [names...]')
    .description('creates a worker')
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
    .command('bundle <application-path>')
    .description('stores a program')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .option('-n,--name <name>', 'Store the bundle into Endo')
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
    .command('mkdir <name>')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .description('makes a directory')
    .action(async (name, cmd) => {
      const { as: partyNames } = cmd.opts();
      const { mkdir } = await import('./mkdir.js');
      return mkdir({ name, partyNames });
    });

  program
    .command('mkhost <name>')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .description('makes a separate mailbox and storage for you')
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
    .description('makes a mailbox and storage for a guest (peer or program)')
    .action(async (name, cmd) => {
      const { as: partyNames } = cmd.opts();
      const { mkguest } = await import('./mkguest.js');
      return mkguest({ name, partyNames });
    });

  program
    .command('cancel <name> [reason]')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .description('cancel a value and its deps, recovering resources')
    .action(async (name, reason, cmd) => {
      const { as: partyNames } = cmd.opts();
      const { cancelCommand } = await import('./cancel.js');
      return cancelCommand({ name, partyNames, reason });
    });

  program
    .command('invite <name> [rsvp]')
    .description('create an invitation for the named peer')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .action(async (guestName, rsvpName = guestName, cmd) => {
      const { as: partyNames } = cmd.opts();
      const { invite } = await import('./invite.js');
      return invite({ guestName, rsvpName, partyNames });
    });

  program
    .command('accept <name>')
    .description('accept an invitation from the named peer')
    .option(
      '-a,--as <party>',
      'Pose as named party (as named by current party)',
      collect,
      [],
    )
    .action(async (guestName, cmd) => {
      const { as: partyNames } = cmd.opts();
      const { accept } = await import('./accept.js');
      return accept({ guestName, partyNames });
    });

  const where = program
    .command('where')
    .description('prints paths for state, logs, caches, socket, pids');

  where
    .command('state')
    .description('prints the state directory path')
    .action(async _cmd => {
      const { statePath } = await import('./locator.js');
      process.stdout.write(`${statePath}\n`);
    });

  where
    .command('run')
    .description('prints the daemon PID file path')
    .action(async _cmd => {
      const { ephemeralStatePath } = await import('./locator.js');
      process.stdout.write(`${ephemeralStatePath}\n`);
    });

  where
    .command('sock')
    .description('prints the UNIX domain socket or Windows named pipe path')
    .action(async _cmd => {
      const { sockPath } = await import('./locator.js');
      process.stdout.write(`${sockPath}\n`);
    });

  where
    .command('log')
    .description('prints the log file path')
    .action(async _cmd => {
      const { logPath } = await import('./locator.js');
      process.stdout.write(`${logPath}\n`);
    });

  where
    .command('cache')
    .description('prints the cache directory path')
    .action(async _cmd => {
      const { cachePath } = await import('./locator.js');
      process.stdout.write(`${cachePath}\n`);
    });

  program
    .command('start')
    .description('start the endo daemon')
    .action(async _cmd => {
      const { start } = await import('@endo/daemon');
      await start();
    });

  program
    .command('stop')
    .description('stop the endo daemon')
    .action(async _cmd => {
      const { stop } = await import('@endo/daemon');
      await stop();
    });

  program
    .command('restart')
    .description('stop and start the daemon')
    .action(async _cmd => {
      const { restart } = await import('@endo/daemon');
      await restart();
    });

  program
    .command('clean')
    .description('erases ephemeral state')
    .action(async _cmd => {
      const { clean } = await import('@endo/daemon');
      await clean();
    });

  program
    .command('reset')
    .description('erases persistent state and restarts if running')
    .action(async _cmd => {
      const { reset } = await import('@endo/daemon');
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
