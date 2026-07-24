// @ts-check
// endo run --UNCONFINED setup-peer.js --powers @agent
//
// PEER-side provisioning. Run this on the machine that owns the Anthropic
// account (the credential holder), NOT the sandbox host. Idempotent. Mints,
// nested under `claude-credentials/`:
//
//   service          — the factory caplet (form loop; help() only).
//   profile, handle  — the factory guest (agent + handle).
//   readme           — describes the objects + sharing security
//                      (`endo show claude-credentials/readme`).
//
// The long-lived API key/token never leaves this peer: the minted
// ClaudeCredentials cap materialises only a short-lived secret to the sandbox
// host at container-spawn time. Send that minted credential cap (not these
// factory objects) to the host in a session-request package to authorize a
// session.
//
// The sandbox factory + container infra belong on the HOST machine — see
// setup-host.js. For single-machine dev, run both.

import { main as provisionCredentialsFactory } from './credentials.js';

/** @import { EndoHost } from '@endo/daemon' */

/**
 * @param {EndoHost} hostAgent
 */
export const main = async hostAgent => {
  await provisionCredentialsFactory(hostAgent);

  console.log('Claude credentials PEER setup complete.');
  console.log(
    'Next: `endo inbox`, then submit the "Create Claude Credentials" form with `endo submit`.',
  );
};
harden(main);
