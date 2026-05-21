// @ts-check
// endo run --UNCONFINED attach.js --powers @agent <rootPath> <name> [ro]
//
// Symmetric with @endo/daemon's `endo mount`: register a host
// directory as a formulated endo-fs `Filesystem` cap addressable
// by the given pet name. The cap reincarnates across daemon
// restart via `makeUnconfined`. Idempotent — re-running with the
// same name is a no-op. Pass `ro` as the third positional to wrap
// the cap with `readOnly`.

import { E } from '@endo/eventual-send';

const moduleSpecifier = new URL('./src/node-fs-module.js', import.meta.url)
  .href;

/**
 * @param {import('@endo/eventual-send').ERef<object>} agent
 * @param {string} [rootPath]
 * @param {string} [name]
 * @param {string} [mode]
 */
export const main = async (agent, rootPath, name, mode) => {
  if (typeof rootPath !== 'string' || rootPath.length === 0) {
    throw new Error('Usage: attach <rootPath> <name> [ro]');
  }
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('Usage: attach <rootPath> <name> [ro]');
  }
  const readOnly = mode === 'ro';

  if (await E(agent).has(name)) {
    console.log(`${name} already provisioned — skipping`);
    return;
  }

  /** @type {Record<string, string>} */
  const env = { ENDO_FS_ROOT: rootPath };
  if (readOnly) env.ENDO_FS_READ_ONLY = '1';

  await E(agent).makeUnconfined('@node', moduleSpecifier, {
    resultName: name,
    env,
  });

  console.log(
    `Attached ${rootPath} as ${name}${readOnly ? ' (read-only)' : ''}`,
  );
};
harden(main);
