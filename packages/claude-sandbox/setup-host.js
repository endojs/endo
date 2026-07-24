// @ts-check
/* global process */
// endo run --UNCONFINED setup-host.js --powers @agent
//   [-E NINEP_SUDO=1]
//   [-E CLAUDE_SANDBOX_IMAGE=oci.example/claude:latest]
//   [-E CLAUDE_SANDBOX_MOUNT_DIR=/var/lib/endo/claude-mounts]
//
// HOST-side provisioning for the Claude sandbox stack. Run this on the
// machine that runs the containers (Linux + podman). Idempotent. Mints,
// nested under `claude-sandbox/` so the host root stays clean:
//
//   sandbox-factory  — the `@endo/sandbox` plugin (podman/bwrap).
//   fs-mounter       — the `@endo/9p-server` mount caplet. `mount(2)` needs
//                      `CAP_SYS_ADMIN`; pass `-E NINEP_SUDO=1` to route
//                      mount/umount through `sudo` on an unprivileged daemon.
//   service          — the factory caplet (mailbox/form loops; help() only).
//   profile, handle  — the factory guest (agent + handle).
//   readme           — describes the objects + sharing security
//                      (`endo show claude-sandbox/readme`).
//
// The credentials factory belongs on the PEER machine (the credential
// holder) — see setup-peer.js. For single-machine dev, run both.

import { E } from '@endo/eventual-send';

import { main as provisionSandboxFactory } from './factory.js';

/** @import { EndoHost } from '@endo/daemon' */

const sandboxSpecifier = new URL('../sandbox/src/agent.js', import.meta.url)
  .href;
const mountCapletSpecifier = new URL(
  '../9p-server/mount-caplet.js',
  import.meta.url,
).href;

// Kept in sync with factory.js's default and the caplet's SANDBOX_NAMESPACE.
const SANDBOX_DIR = 'claude-sandbox';

/**
 * @param {EndoHost} hostAgent
 */
export const main = async hostAgent => {
  const { env } = process;

  if (!(await E(hostAgent).has(SANDBOX_DIR))) {
    await E(hostAgent).makeDirectory([SANDBOX_DIR]);
  }

  // 1. Sandbox factory — `@agent` powers grant the privileged
  //    `provideHostPath` / `provideScratchMount` surface the factory needs
  //    to bridge granted Mount caps into the kernel's bind-mount surface.
  if (!(await E(hostAgent).has(SANDBOX_DIR, 'sandbox-factory'))) {
    await E(hostAgent).makeUnconfined('@main', sandboxSpecifier, {
      powersName: '@agent',
      resultName: [SANDBOX_DIR, 'sandbox-factory'],
    });
    console.log(`Minted ${SANDBOX_DIR}/sandbox-factory`);
  }

  // 2. 9P mounter — unconfined; ambient Node authority (no Endo powers).
  if (!(await E(hostAgent).has(SANDBOX_DIR, 'fs-mounter'))) {
    /** @type {Record<string, string>} */
    const mounterEnv = {};
    for (const key of ['NINEP_SUDO', 'NINEP_LAZY_UMOUNT', 'NINEP_SOCKET_DIR']) {
      if (env[key] !== undefined) {
        mounterEnv[key] = /** @type {string} */ (env[key]);
      }
    }
    await E(hostAgent).makeUnconfined('@main', mountCapletSpecifier, {
      powersName: '@none',
      resultName: [SANDBOX_DIR, 'fs-mounter'],
      env: harden(mounterEnv),
    });
    console.log(`Minted ${SANDBOX_DIR}/fs-mounter`);
  }

  // 3. Claude sandbox factory (service/profile/handle + readme). Pass
  //    SANDBOX_DIR explicitly so setup and the factory agree on the dir name.
  await provisionSandboxFactory(hostAgent, SANDBOX_DIR);

  console.log('Claude sandbox HOST setup complete.');
  console.log(
    'Next: `endo inbox`, then submit the "Create Claude Sandbox" form with `endo submit`.',
  );
};
harden(main);
