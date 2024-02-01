/* global process */
import os from 'os';
import { E } from '@endo/far';
import { whereEndoSock } from '@endo/where';
import { makeEndoClient } from '@endo/daemon';
import { withInterrupt } from '../context.js';

export const ping = () =>
  withInterrupt(async ({ cancel, cancelled }) => {
    const { username, homedir } = os.userInfo();
    const temp = os.tmpdir();
    const info = {
      user: username,
      home: homedir,
      temp,
    };

    const sockPath = whereEndoSock(process.platform, process.env, info);

    const { getBootstrap } = await makeEndoClient(
      'health-checker',
      sockPath,
      cancelled,
    );
    const bootstrap = getBootstrap();
    await E(bootstrap).ping();
    process.stderr.write('ok\n');
  });
