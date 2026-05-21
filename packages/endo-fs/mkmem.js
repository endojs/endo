// @ts-check
// endo run --UNCONFINED mkmem.js --powers @agent
//   -E ENDO_FS_NAME=<pet name>
//
// Symmetric with @endo/daemon's `endo mktmp`: mint a fresh
// in-memory endo-fs `Filesystem` cap registered under the given
// pet name. The cap reincarnates across daemon restart via
// `makeUnconfined`; its contents do not — the filesystem is
// rebuilt empty each time the underlying module is
// re-instantiated.

/* global process */

import { E } from '@endo/eventual-send';

const moduleSpecifier = new URL('./src/in-memory-module.js', import.meta.url)
  .href;

/**
 * @param {import('@endo/eventual-send').ERef<object>} agent
 */
export const main = async agent => {
  const name = process.env.ENDO_FS_NAME;
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('ENDO_FS_NAME environment variable is required');
  }

  if (await E(agent).has(name)) {
    console.log(`${name} already provisioned — skipping`);
    return;
  }

  await E(agent).makeUnconfined('@node', moduleSpecifier, {
    resultName: name,
  });

  console.log(`Created in-memory Filesystem as ${name}`);
};
harden(main);
