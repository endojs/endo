/* global harden, process */
// @ts-check
// endo run --UNCONFINED setup-fs-tools.js --powers AGENT
// Optional: FAE_CWD=/path/to/root endo run ... to set root directory (default: process.cwd())
//
// Creates filesystem tool caplets in the host's inventory. Each tool's root
// directory is fixed at creation time (FAE_CWD or current directory).

import { E } from '@endo/eventual-send';

/**
 * @param {import('@endo/eventual-send').ERef<object>} agent
 */
export const main = async agent => {
  const cwd = process.env.FAE_CWD || process.cwd();
  const env = { FAE_CWD: cwd };

  const readFileUrl = new URL('tools/read-file.js', import.meta.url).href;
  const writeFileUrl = new URL('tools/write-file.js', import.meta.url).href;
  const editFileUrl = new URL('tools/edit-file.js', import.meta.url).href;
  const listDirUrl = new URL('tools/list-dir.js', import.meta.url).href;
  const runCommandUrl = new URL('tools/run-command.js', import.meta.url).href;

  await E(agent).makeUnconfined('MAIN', readFileUrl, {
    resultName: 'read-file',
    env,
  });
  console.log('[setup-fs-tools] Created read-file (root:', cwd, ')');

  await E(agent).makeUnconfined('MAIN', writeFileUrl, {
    resultName: 'write-file',
    env,
  });
  console.log('[setup-fs-tools] Created write-file');

  await E(agent).makeUnconfined('MAIN', editFileUrl, {
    resultName: 'edit-file',
    env,
  });
  console.log('[setup-fs-tools] Created edit-file');

  await E(agent).makeUnconfined('MAIN', listDirUrl, {
    resultName: 'list-dir',
    env,
  });
  console.log('[setup-fs-tools] Created list-dir');

  await E(agent).makeUnconfined('MAIN', runCommandUrl, {
    resultName: 'run-command',
    env,
  });
  console.log('[setup-fs-tools] Created run-command');

  console.log(
    '[setup-fs-tools] All filesystem tools created in host inventory.',
  );
};
harden(main);
