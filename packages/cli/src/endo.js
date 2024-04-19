// @ts-nocheck
/* global process */
/* eslint-disable no-await-in-loop, no-bitwise, no-throw-literal */

// Establish a perimeter:
import 'ses';
import '@endo/eventual-send/shim.js';
import '@endo/lockdown/commit.js';

import fs from 'fs';
import url from 'url';

import { Command } from 'commander';
import { prompt } from './prompt.js';

const packageDescriptorPath = url.fileURLToPath(
  new URL('../package.json', import.meta.url),
);

const commonOptions = {
  as: ['-a,--as <agent>', 'Pose as named agent (as named by current agent)'],
  name: [
    '-n,--name <name>',
    'Assigns a name to the result for future reference',
  ],
  requiredName: [
    '-n,--name <name>',
    'Assigns a name to the result for future reference (required)',
  ],
};

const parseOptionAsMapping = (optionValueString, obj) => {
  // arguments can be provided as "a:b" or just "a"
  // eslint-disable-next-line prefer-const
  let [from, to] = optionValueString.split(':');
  if (to === undefined) {
    to = from;
  }
  obj[from] = to;
  return obj;
};

export const main = async rawArgs => {
  const program = new Command();

  program.storeOptionsAsProperties(false);

  const packageDescriptorBytes = await fs.promises.readFile(
    packageDescriptorPath,
  );
  const packageDescriptor = JSON.parse(packageDescriptorBytes);
  program.name('endo').version(packageDescriptor.version);

  program
    .command('install [filePath]')
    .description('installs a web page (weblet)')
    .option(...commonOptions.as)
    .option(
      '-l,--listen,--port <number>',
      'Port assignment (required)',
      (arg, previous) => {
        if (previous !== undefined) {
          throw `-l,--listen,--port can only be specified once`;
        }
        const port = parseInt(arg, 10);
        if (Number.isNaN(port) || (port & ~0xffff) !== 0) {
          throw `-l,--listen,--port flag must be a valid port number, got ${JSON.stringify(
            arg,
          )}`;
        }
        return port;
      },
    )
    .option('-b,--bundle <bundle>', 'Bundle for a web page (weblet)')
    .option(
      '-p,--powers <endowment>',
      'Endowment to give the weblet (a name, NONE, SELF, or ENDO)',
    )
    .option(...commonOptions.requiredName)
    .option('-o,--open', 'Open the new web page immediately (weblet)')
    .action(async (programPath, cmd) => {
      const {
        name: webletName,
        bundle: bundleName,
        powers: powersName = 'NONE',
        listen: requestedPort,
        as: agentNames,
        open: doOpen,
      } = cmd.opts();
      if (requestedPort === undefined) {
        throw 'The -l, --listen, or --port <number> flag is required';
      }
      const { install } = await import('./commands/install.js');
      return install({
        doOpen,
        webletName,
        requestedPort,
        programPath,
        bundleName,
        powersName,
        agentNames,
      });
    });

  program
    .command('open <name>')
    .description('opens a web page (weblet)')
    .option(...commonOptions.as)
    .action(async (webletName, cmd) => {
      const { as: agentNames } = cmd.opts();
      const { open } = await import('./commands/open.js');
      return open({
        webletName,
        agentNames,
      });
    });
  program
    .command('run [<file>] [<args>...]')
    .description('runs a program (runlet)')
    .option(...commonOptions.as)
    .option('-b,--bundle <bundle>', 'Bundle name for the caplet program')
    .option(
      '--UNCONFINED <path>',
      'Or path of an unconfined plugin to run in Node.js',
    )
    .option(
      '-p,--powers <endowment>',
      'Endowment to give the worklet (a name, NONE, HOST, or ENDO)',
    )
    .action(async (filePath, args, cmd) => {
      const {
        as: agentNames,
        bundle: bundleName,
        UNCONFINED: importPath,
        powers: powersName = 'NONE',
      } = cmd.opts();
      const { run } = await import('./commands/run.js');
      return run({
        filePath,
        args,
        bundleName,
        importPath,
        powersName,
        agentNames,
      });
    });

  program
    .command('make [file]')
    .description('make a plugin or a worker caplet (worklet)')
    .option('-b,--bundle <bundle>', 'Bundle for a web page to open')
    .option('--UNCONFINED <file>', 'Path to a Node.js module')
    .option(...commonOptions.as)
    .option('-p,--powers <name>', 'Name of powers to grant or NONE, SELF, ENDO')
    .option(...commonOptions.name)
    .option(
      '-w,--worker <worker>',
      'Reuse an existing worker rather than create a new one',
    )
    .action(async (filePath, cmd) => {
      const {
        UNCONFINED: importPath,
        name: resultName,
        bundle: bundleName,
        worker: workerName = 'NEW',
        as: agentNames,
        powers: powersName = 'NONE',
      } = cmd.opts();
      const { makeCommand } = await import('./commands/make.js');
      return makeCommand({
        filePath,
        importPath,
        resultName,
        bundleName,
        workerName,
        agentNames,
        powersName,
      });
    });

  program
    .command('inbox')
    .option(...commonOptions.as)
    .option('-f,--follow', 'Follow the inbox for messages as they arrive')
    .description('read messages')
    .action(async cmd => {
      const { as: agentNames, follow } = cmd.opts();
      const { inbox } = await import('./commands/inbox.js');
      return inbox({ follow, agentNames });
    });

  program
    .command('request <informal-description>')
    .description('ask someone for something')
    .option(
      '-t,--to <agent>',
      'Send the request to another agent (default: HOST)',
    )
    .option(...commonOptions.as)
    .option(...commonOptions.name)
    .action(async (description, cmd) => {
      const {
        name: resultName,
        as: agentNames,
        to: toName = 'HOST',
      } = cmd.opts();
      const { request } = await import('./commands/request.js');
      return request({ toName, description, resultName, agentNames });
    });

  program
    .command('resolve <request-number> <resolution-name>')
    .description('grant a request')
    .option(...commonOptions.as)
    .action(async (requestNumberText, resolutionName, cmd) => {
      const { as: agentNames } = cmd.opts();
      const { resolveCommand } = await import('./commands/resolve.js');
      return resolveCommand({
        requestNumberText,
        resolutionName,
        agentNames,
      });
    });

  program
    .command('reject <request-number> [message]')
    .description('deny a request')
    .option(...commonOptions.as)
    .action(async (requestNumberText, message, cmd) => {
      const { as: agentNames } = cmd.opts();
      const { rejectCommand } = await import('./commands/reject.js');
      return rejectCommand({
        requestNumberText,
        message,
        agentNames,
      });
    });

  program
    .command('send <agent> <message-with-embedded-references>')
    .description('send a message with @named-values @for-you:from-me')
    .option(...commonOptions.as)
    .action(async (agentName, message, cmd) => {
      const { as: agentNames } = cmd.opts();
      const { send } = await import('./commands/send.js');
      return send({ message, agentName, agentNames });
    });

  program
    .command('adopt <message-number> <name-in-message>')
    .option(...commonOptions.name)
    .option(...commonOptions.as)
    .description('adopt a @value from a message')
    .action(async (messageNumberText, edgeName, cmd) => {
      const { name = edgeName, as: agentNames } = cmd.opts();
      const { adoptCommand } = await import('./commands/adopt.js');
      return adoptCommand({
        messageNumberText,
        edgeName,
        name,
        agentNames,
      });
    });

  program
    .command('dismiss <message-number>')
    .description('delete a message')
    .option(...commonOptions.as)
    .action(async (messageNumberText, cmd) => {
      const { as: agentNames } = cmd.opts();
      const { dismissCommand } = await import('./commands/dismiss.js');
      return dismissCommand({
        messageNumberText,
        agentNames,
      });
    });

  program
    .command('list [directory]')
    .description('show names known to the current or specified directory')
    .option('-f,--follow', 'Follow updates')
    .option('-j,--json', 'JSON format output')
    .action(async (directoryPath, cmd) => {
      const { follow, json } = cmd.opts();
      const { list } = await import('./commands/list.js');
      return list({ directoryPath, follow, json });
    });

  program
    .command('remove [names...]')
    .description('forget a named value')
    .option(...commonOptions.as)
    .action(async (petNames, cmd) => {
      const { as: agentNames } = cmd.opts();
      const { remove } = await import('./commands/remove.js');
      return remove({ petNames, agentNames });
    });

  program
    .command('move <from> <to>')
    .alias('mv')
    .description('change the name for a value')
    .option(...commonOptions.as)
    .action(async (fromPath, toPath, cmd) => {
      const { as: agentNames } = cmd.opts();
      const { move } = await import('./commands/move.js');
      return move({ fromPath, toPath, agentNames });
    });

  program
    .command('show <name>')
    .description('prints the named value')
    .option(...commonOptions.as)
    .action(async (name, cmd) => {
      const { as: agentNames } = cmd.opts();
      const { show } = await import('./commands/show.js');
      return show({ name, agentNames });
    });

  program
    .command('follow <name>')
    .option(...commonOptions.as)
    .description('subscribe to a stream of values')
    .action(async (name, cmd) => {
      const { as: agentNames } = cmd.opts();
      const { followCommand } = await import('./commands/follow.js');
      return followCommand({ name, agentNames });
    });

  program
    .command('cat <name>')
    .description('dumps a blob')
    .option(...commonOptions.as)
    .action(async (name, cmd) => {
      const { as: agentNames } = cmd.opts();
      const { cat } = await import('./commands/cat.js');
      return cat({ name, agentNames });
    });

  program
    .command('store')
    .description('stores a blob or structured value')
    .option(...commonOptions.as)
    .option(...commonOptions.name)
    .option('-p,--path <path>', 'store a file as a blob')
    .option('--stdin', 'store stdin as a blob')
    .option('--text <text>', 'store a string of UTF-8 text')
    .option('--text-stdin', 'store STDIN as UTF-8 text')
    .option('--json <json>', 'store JSON')
    .option('--json-stdin', 'store STDIN JSON')
    .option('--bigint <bigint>', 'store a bigint')
    .action(async cmd => {
      const {
        name,
        as: agentNames,
        path: storePath,
        stdin: storeStdin,
        text: storeText,
        textStdin: storeTextStdin,
        json: storeJson,
        jsonStdin: storeJsonStdin,
        bigint: storeBigInt,
      } = cmd.opts();
      const { store } = await import('./commands/store.js');
      return store({
        storePath,
        storeStdin,
        storeText,
        storeTextStdin,
        storeJson,
        storeJsonStdin,
        storeBigInt,
        name,
        agentNames,
      });
    });

  program
    .command('eval <source> [names...]')
    .description('creates a value')
    .option(...commonOptions.as)
    .option(
      '-w,--worker <worker>',
      'Reuse an existing worker rather than create a new one',
    )
    .option(...commonOptions.name)
    .action(async (source, names, cmd) => {
      const {
        name: resultName,
        worker: workerName = 'MAIN',
        as: agentNames,
      } = cmd.opts();
      const { evalCommand } = await import('./commands/eval.js');
      return evalCommand({
        source,
        names,
        resultName,
        workerName,
        agentNames,
      });
    });

  program
    .command('spawn [names...]')
    .description('creates a worker')
    .option(...commonOptions.as)
    .action(async (petNames, cmd) => {
      const { as: agentNames } = cmd.opts();
      const { spawn } = await import('./commands/spawn.js');
      return spawn({ petNames, agentNames });
    });

  program
    .command('bundle <application-path>')
    .description('stores a program')
    .option(...commonOptions.as)
    .option(...commonOptions.name)
    .option(
      '--common-dep <name>',
      'Specify common dependency for bundle (eg node builtin package shims)',
      parseOptionAsMapping,
      {},
    )
    .action(async (applicationPath, cmd) => {
      const {
        name: bundleName,
        as: agentNames,
        commonDep: commonDependencies,
      } = cmd.opts();
      const { bundleCommand } = await import('./commands/bundle.js');
      return bundleCommand({
        applicationPath,
        bundleName,
        agentNames,
        bundleOptions: {
          commonDependencies,
        },
      });
    });

  program
    .command('mkhost <handle-name> [agent-name]')
    .option(...commonOptions.as)
    .option(
      '--introduce <name>',
      'Specify initial petnames for the new host. Use multiple times for multiple petnames. Format: --introduce myPetname:theirPetname',
      parseOptionAsMapping,
      {},
    )
    .description('makes a separate mailbox and storage for you')
    .action(async (handleName, agentName, cmd) => {
      const { as: agentNames, introduce: introducedNames } = cmd.opts();
      const { mkhost } = await import('./commands/mkhost.js');
      return mkhost({ handleName, agentName, agentNames, introducedNames });
    });

  program
    .command('mkguest <handle-name> [agent-name]')
    .option(...commonOptions.as)
    .option(
      '--introduce <name>',
      'Specify initial petnames for the new guest. Use multiple times for multiple petnames. Format: --introduce myPetname:theirPetname',
      parseOptionAsMapping,
      {},
    )
    .description('makes a mailbox and storage for a guest (peer or program)')
    .action(async (handleName, agentName, cmd) => {
      const { as: agentNames, introduce: introducedNames } = cmd.opts();
      const { mkguest } = await import('./commands/mkguest.js');
      return mkguest({ agentName, handleName, agentNames, introducedNames });
    });

  program
    .command('invite <guest-name>')
    .option(...commonOptions.as)
    .action(async (guestName, cmd) => {
      const { as: agentNames } = cmd.opts();
      const { invite } = await import('./commands/invite.js');
      return invite({ agentNames, guestName });
    });

  program
    .command('accept <guest-name>')
    .option(...commonOptions.as)
    .action(async (guestName, cmd) => {
      const { as: agentNames } = cmd.opts();
      const { accept } = await import('./commands/accept.js');
      return accept({ agentNames, guestName });
    });

  program
    .command('cancel <name> [reason]')
    .option(...commonOptions.as)
    .description('cancel a value and its deps, recovering resources')
    .action(async (name, reason, cmd) => {
      const { as: agentNames } = cmd.opts();
      const { cancelCommand } = await import('./commands/cancel.js');
      return cancelCommand({ name, agentNames, reason });
    });

  const where = program
    .command('where')
    .description('prints paths for state, logs, caches, socket, pids');

  where
    .command('state')
    .description('prints the state directory path')
    .action(async _cmd => {
      const { statePath } = await import('./config.js');
      process.stdout.write(`${statePath}\n`);
    });

  where
    .command('run')
    .description('prints the daemon PID file path')
    .action(async _cmd => {
      const { ephemeralStatePath } = await import('./config.js');
      process.stdout.write(`${ephemeralStatePath}\n`);
    });

  where
    .command('sock')
    .description('prints the UNIX domain socket or Windows named pipe path')
    .action(async _cmd => {
      const { sockPath } = await import('./config.js');
      process.stdout.write(`${sockPath}\n`);
    });

  where
    .command('log')
    .description('prints the log file path')
    .action(async _cmd => {
      const { logPath } = await import('./config.js');
      process.stdout.write(`${logPath}\n`);
    });

  where
    .command('cache')
    .description('prints the cache directory path')
    .action(async _cmd => {
      const { cachePath } = await import('./config.js');
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
    .command('purge')
    .option('-f, --force', 'skip the confirmation prompt')
    .description('erases persistent state and stops if running')
    .action(async cmd => {
      const { force } = cmd.opts();
      const doPurge =
        force ||
        /^y(es)?$/u.test(
          await prompt(
            'Are you sure you want to erase all state? This irreversible action will permanently sever all peer connections. Continue? (y/n)',
          ),
        );
      if (doPurge) {
        const { purge } = await import('@endo/daemon');
        await purge();
      }
    });

  program
    .command('log')
    .option('-f, --follow', 'follow the tail of the log')
    .option(
      '-p,--ping <interval>',
      'milliseconds between daemon restart checks',
    )
    .description('writes out the daemon log, optionally following updates')
    .action(async cmd => {
      const { follow, ping } = cmd.opts();
      const { log: logCommand } = await import('./commands/log.js');
      await logCommand({ follow, ping });
    });

  program
    .command('ping')
    .description('prints ok if the daemon is responsive')
    .action(async _cmd => {
      const { ping } = await import('./commands/ping.js');
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
