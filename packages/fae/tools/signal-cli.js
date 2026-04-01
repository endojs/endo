// @ts-check
/* global process */

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

import { makeSignalCli } from '../src/signal-cli.js';

const SignalCliInterface = M.interface('SignalCliTransport', {
  receive: M.call().optional(M.number()).returns(M.promise()),
  sendDirect: M.call(M.string(), M.string()).returns(M.promise()),
  sendGroup: M.call(M.string(), M.string()).returns(M.promise()),
  help: M.call().returns(M.string()),
});

/**
 * Build a signal-cli transport object.
 *
 * Required env:
 * - SIGNAL_ACCOUNT: signal-cli account (phone number)
 *
 * Optional env:
 * - SIGNAL_CLI_BIN: signal-cli binary path (default: "signal-cli")
 */
// eslint-disable-next-line no-underscore-dangle
export const make = (_powers, _context, { env = {} } = {}) => {
  const envRecord = /** @type {Record<string, string | undefined>} */ (env);
  const account = envRecord.SIGNAL_ACCOUNT || process.env.SIGNAL_ACCOUNT;
  const signalCliBin =
    envRecord.SIGNAL_CLI_BIN || process.env.SIGNAL_CLI_BIN || 'signal-cli';
  if (!account) {
    throw new Error('SIGNAL_ACCOUNT is required for signal-cli transport');
  }
  const transport = makeSignalCli({ account, signalCliBin });
  return makeExo('SignalCliTransport', SignalCliInterface, {
    receive: timeoutSeconds => transport.receive(timeoutSeconds),
    sendDirect: (recipient, text) => transport.sendDirect(recipient, text),
    sendGroup: (groupId, text) => transport.sendGroup(groupId, text),
    help: () => transport.help(),
  });
};
harden(make);
