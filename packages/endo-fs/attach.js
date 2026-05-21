// @ts-check
// endo run --UNCONFINED attach.js --powers @agent
//   -E ENDO_FS_ROOT=<absolute path>
//   -E ENDO_FS_NAME=<pet name>
//   [-E ENDO_FS_READ_ONLY=1]
//
// Symmetric with @endo/daemon's `endo mount`: register a host
// directory as a formulated endo-fs `Filesystem` cap addressable
// by the given pet name. The cap reincarnates across daemon
// restart via `makeUnconfined`. Idempotent — re-running with the
// same name is a no-op.

/* global process */

import { E } from '@endo/eventual-send';

const moduleSpecifier = new URL('./src/node-fs-module.js', import.meta.url)
  .href;

/**
 * @param {import('@endo/eventual-send').ERef<object>} agent
 */
export const main = async agent => {
  const rootPath = process.env.ENDO_FS_ROOT;
  const name = process.env.ENDO_FS_NAME;
  const readOnly = process.env.ENDO_FS_READ_ONLY === '1';

  if (typeof rootPath !== 'string' || rootPath.length === 0) {
    throw new Error('ENDO_FS_ROOT environment variable is required');
  }
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('ENDO_FS_NAME environment variable is required');
  }

  if (await E(agent).has(name)) {
    console.log(`${name} already provisioned — skipping`);
    return;
  }

  const env = [`ENDO_FS_ROOT=${rootPath}`];
  if (readOnly) env.push('ENDO_FS_READ_ONLY=1');

  await E(agent).makeUnconfined('@node', moduleSpecifier, {
    resultName: name,
    env,
  });

  console.log(
    `Attached ${rootPath} as ${name}${readOnly ? ' (read-only)' : ''}`,
  );
};
harden(main);
