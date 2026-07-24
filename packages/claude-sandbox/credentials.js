// @ts-check
// endo run --UNCONFINED credentials.js --powers @agent
//   [<factoryName>]
//
// Provision the Claude Credentials factory caplet under @host. The
// factory presents a "Create Claude Credentials" form on @host's
// inbox; each submission stores a `ClaudeCredentials` cap (Anthropic
// API key wrapper) back in @host's petstore under the chosen name.
// That cap is what the ClaudeSandbox factory's `credentials` form
// field references when minting a session.
//
// The credentials factory normally runs on the *peer* machine (the one that
// owns the Anthropic key), not the sandbox host — keeping the long-lived
// secret on the peer. Its objects live under a directory so they don't
// pollute the host root: `<dir>/service`, `<dir>/profile`, `<dir>/handle`.
//
// Defaults:
//   <dirName>   claude-credentials
//
// Idempotent: re-running is a no-op once `<dir>/service` exists.

import { readFileSync } from 'node:fs';

import { E } from '@endo/eventual-send';
import { bytesReaderFromIterator } from '@endo/exo-stream/bytes-reader-from-iterator.js';

// On-disk markdown describing the directory's objects, copied into a
// `<dir>/readme.md` blob at provision time (easy to edit; `.md` lets the chat
// UI render it).
const readmeUrl = new URL(
  './docs/claude-credentials-directory.md',
  import.meta.url,
);

const factoryCapletSpecifier = new URL(
  'src/claude-credentials-factory.js',
  import.meta.url,
).href;

const DEFAULT_FACTORY_NAME = 'claude-credentials';

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
  // re-runs); `endo cat <dir>/readme.md` dumps it.
  if (!(await E(agent).has(dirName, 'readme.md'))) {
    const md = readFileSync(readmeUrl, 'utf8');
    const reader = bytesReaderFromIterator([new TextEncoder().encode(md)]);
    await E(agent).storeBlob(reader, [dirName, 'readme.md']);
  }

  // `<dir>/profile` is the last artifact created, so it is the completion
  // sentinel — every step below is individually guarded so a re-run after a
  // partial failure reconciles rather than leaking the temp top-level names.
  if (
    (await E(agent).has(dirName, 'service')) &&
    (await E(agent).has(dirName, 'profile'))
  ) {
    console.log(`${dirName}/ already provisioned — skipping`);
    return;
  }

  // provideGuest / powersName take a single name only, so the guest is born
  // top-level and moved into the directory after makeUnconfined.
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
