/* global process */

import { E } from '@endo/far';
import { makeEndoClient } from '@endo/daemon';

export const ping = async ({ cancelled, sockPath }) => {
  const { getBootstrap } = await makeEndoClient(
    'health-checker',
    sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  await E(bootstrap).ping();
  process.stderr.write('ok\n');
};
