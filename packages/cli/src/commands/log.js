/* global process, setTimeout, clearTimeout */
/* eslint-disable no-await-in-loop */

import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { makePromiseKit } from '@endo/promise-kit';
import { makeEndoClient } from '@endo/daemon';
import { whereEndoState, whereEndoSock } from '@endo/where';
import { E } from '@endo/far';
import { withInterrupt } from '../context.js';

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

export const log = async ({ follow, ping }) =>
  withInterrupt(async ({ cancelled }) => {
    const logCheckIntervalMs = ping !== undefined ? Number(ping) : 5_000;

    const { username, homedir } = os.userInfo();
    const temp = os.tmpdir();
    const info = {
      user: username,
      home: homedir,
      temp,
    };

    const statePath = whereEndoState(process.platform, process.env, info);
    const sockPath = whereEndoSock(process.platform, process.env, info);

    const logPath = path.join(statePath, 'endo.log');

    do {
      // Scope cancellation and propagate.
      const { promise: followCancelled, reject: cancelFollower } =
        makePromiseKit();
      cancelled.catch(cancelFollower);

      (async () => {
        const client = await makeEndoClient(
          'log-follower-probe',
          sockPath,
          followCancelled,
        ).catch(error => {
          console.error(`Endo offline: ${error.message}`);
        });
        if (client === undefined) {
          return;
        }
        const { getBootstrap } = client;
        const bootstrap = await getBootstrap().catch(error => {
          console.error(`Endo offline: ${error.message}`);
        });
        if (bootstrap === undefined) {
          return;
        }
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
