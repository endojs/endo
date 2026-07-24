// @ts-check
/* global process */
// endo run --UNCONFINED factory.js --powers @agent  [<dirName>]
//
// Provision the Claude Sandbox factory caplet under @host. The factory
// presents a "Create Claude Sandbox" form on @host's inbox; each
// submission mounts a Filesystem cap over 9P on the host, mints a
// podman slice with that workspace bound at /workspace, runs Claude
// Code inside it, and stores a ClaudeClient exo back in @host's
// petstore.
//
// Everything lands under a host directory (`<dirName>/`) so the host root
// stays clean: `<dirName>/{service, profile, handle}` plus the infra
// caplets `<dirName>/{sandbox-factory, fs-mounter}`.
//
// Prerequisites (mint them first, or use setup-host.js which does everything):
//   - a sandbox factory at `<dirName>/sandbox-factory`
//     (from `@endo/sandbox`'s agent.js), and
//   - a 9P mounter at `<dirName>/fs-mounter`
//     (from `@endo/9p-server`'s mount-caplet.js).
//
// Caplet env (threaded from this process's environment):
//   SANDBOX_FACTORY_NAME      name of the sandbox factory within the
//                             directory (default `sandbox-factory`).
//   FS_MOUNTER_NAME           name of the 9P mounter within the directory
//                             (default `fs-mounter`).
//   CLAUDE_SANDBOX_IMAGE      default OCI image when the form's rootfs
//                             field is blank.
//   CLAUDE_SANDBOX_BACKEND    sandbox backend (default `podman`).
//   CLAUDE_SANDBOX_MOUNT_DIR  base dir for per-session 9P mountpoints
//                             (default the OS temp dir).
//   (SANDBOX_NAMESPACE is set automatically to <dirName>.)
//
// Defaults:
//   <dirName>   claude-sandbox
//
// Idempotent: re-running is a no-op once `<dirName>/service` exists.

import { readFileSync } from 'node:fs';

import { E } from '@endo/eventual-send';
import { bytesReaderFromIterator } from '@endo/exo-stream/bytes-reader-from-iterator.js';

const factoryCapletSpecifier = new URL(
  'src/claude-sandbox-factory.js',
  import.meta.url,
).href;

// On-disk markdown describing the directory's objects, copied into a
// `<dir>/readme.md` blob at provision time. Kept on disk (not inlined) so it
// is easy to edit; the `.md` name lets the chat UI render it as markdown.
const readmeUrl = new URL(
  './docs/claude-sandbox-directory.md',
  import.meta.url,
);

// The host-side directory this factory's objects live under, so they don't
// pollute the host root: `<dir>/service` (the factory caplet — runs the
// mailbox/form loops; exposes only help()), `<dir>/profile` (the factory
// guest's agent), `<dir>/handle` (the guest), plus the infra caplets
// `<dir>/sandbox-factory` and `<dir>/fs-mounter` (minted by setup-host.js).
const DEFAULT_FACTORY_NAME = 'claude-sandbox';

const CAPLET_ENV_KEYS = [
  'SANDBOX_FACTORY_NAME',
  'FS_MOUNTER_NAME',
  'CLAUDE_SANDBOX_IMAGE',
  'CLAUDE_SANDBOX_BACKEND',
  'CLAUDE_SANDBOX_MOUNT_DIR',
];

/**
 * Collect the caplet env vars present in this process's environment so
 * the formula reincarnates with the same configuration.
 *
 * @returns {Record<string, string>}
 */
const collectCapletEnv = () => {
  /** @type {Record<string, string>} */
  const capletEnv = {};
  for (const key of CAPLET_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) {
      capletEnv[key] = value;
    }
  }
  return capletEnv;
};

/**
 * @param {import('@endo/eventual-send').ERef<object>} agent
 * @param {string} [dirName]
 */
export const main = async (agent, dirName = DEFAULT_FACTORY_NAME) => {
  // The directory must exist before any path-form `has`/`move` (a path `has`
  // throws "Unknown pet name" when the directory itself is absent).
  if (!(await E(agent).has(dirName))) {
    await E(agent).makeDirectory([dirName]);
  }

  // Document the directory's objects as a markdown blob (backfilled on
  // re-runs). The `.md` name lets the chat UI render it; `endo cat
  // <dir>/readme.md` dumps it.
  if (!(await E(agent).has(dirName, 'readme.md'))) {
    const md = readFileSync(readmeUrl, 'utf8');
    const reader = bytesReaderFromIterator([new TextEncoder().encode(md)]);
    await E(agent).storeBlob(reader, [dirName, 'readme.md']);
  }

  // Fully provisioned? `<dir>/profile` is the *last* artifact created (after
  // the service and the handle move), so it is the completion sentinel —
  // keying on `service` would skip a re-run that still needs to finish the
  // moves, orphaning the temp top-level names.
  if (
    (await E(agent).has(dirName, 'service')) &&
    (await E(agent).has(dirName, 'profile'))
  ) {
    console.log(`${dirName}/ already provisioned — skipping`);
    return;
  }

  // `provideGuest` / `powersName` take a single (non-path) name, so the guest
  // is born under temporary top-level names and `move`d into the directory
  // (the caplet holds its powers by formula id, so the rename is transparent).
  // Every step below is individually guarded so a re-run after a partial
  // failure reconciles the state rather than leaking the temp names.
  const guestTmp = `${dirName}-guest`;
  const agentTmp = `${dirName}-agent`;
  if (
    !(await E(agent).has(guestTmp)) &&
    !(await E(agent).has(dirName, 'handle'))
  ) {
    await E(agent).provideGuest(guestTmp, {
      introducedNames: harden({ '@agent': 'host-agent' }),
      agentName: agentTmp,
    });
  }

  if (!(await E(agent).has(dirName, 'service'))) {
    await E(agent).makeUnconfined('@main', factoryCapletSpecifier, {
      powersName: agentTmp,
      resultName: [dirName, 'service'],
      // Tell the caplet where its infra caplets live so the per-session powers
      // endows `<dir>/sandbox-factory` and `<dir>/fs-mounter` by path.
      env: harden({ ...collectCapletEnv(), SANDBOX_NAMESPACE: dirName }),
    });
  }

  if (await E(agent).has(guestTmp)) {
    await E(agent).move([guestTmp], [dirName, 'handle']);
  }
  if (await E(agent).has(agentTmp)) {
    await E(agent).move([agentTmp], [dirName, 'profile']);
  }

  console.log(`Factory provisioned under ${dirName}/`);
};
harden(main);
