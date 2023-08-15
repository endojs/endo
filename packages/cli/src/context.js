/* global process */

import { makePromiseKit } from '@endo/promise-kit';
import { E } from '@endo/far';
import { whereEndoSock } from '@endo/where';
import { provideEndoClient } from './client.js';

export const withInterrupt = async callback => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  cancelled.catch(() => {});
  process.once('SIGINT', () => cancel(Error('SIGINT')));

  try {
    await callback({ cancel, cancelled });
    cancel(Error('normal termination'));
  } catch (error) {
    console.error(error);
    cancel(error);
  }
};

export const withEndoBootstrap = (
  { os, process, clientName = 'cli' },
  callback,
) =>
  withInterrupt(async ({ cancel, cancelled }) => {
    const { username, homedir } = os.userInfo();
    const temp = os.tmpdir();
    const info = {
      user: username,
      home: homedir,
      temp,
    };

    const sockPath = whereEndoSock(process.platform, process.env, info);

    const { getBootstrap } = await provideEndoClient(
      clientName,
      sockPath,
      cancelled,
    );
    const bootstrap = getBootstrap();
    await callback({
      cancel,
      cancelled,
      bootstrap,
    });
  });

export const withEndoHost = ({ os, process }, callback) =>
  withEndoBootstrap(
    { os, process },
    async ({ cancel, cancelled, bootstrap }) => {
      const host = E(bootstrap).host();
      await callback({
        cancel,
        cancelled,
        bootstrap,
        host,
      });
    },
  );

export const withEndoParty = (partyNames, { os, process }, callback) =>
  withEndoHost(
    { os, process },
    async ({ cancel, cancelled, bootstrap, host }) => {
      let party = host;
      for (const partyName of partyNames) {
        party = E(party).provide(partyName);
      }
      await callback({
        cancel,
        cancelled,
        bootstrap,
        host,
        party,
      });
    },
  );
