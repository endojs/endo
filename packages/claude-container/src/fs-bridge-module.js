// @ts-check
/* global process */

import { E } from '@endo/eventual-send';

import { makeFsBridge9p } from './fs-bridge-9p.js';

/**
 * Per-session 9P bridge caplet. The factory provisions one of these
 * per Create Claude Container submission via `makeUnconfined` on the
 * host agent so the bridge is a first-class Endo capability whose
 * formula encodes the FS pet name + UDS path.
 *
 * On daemon restart, the formula reincarnates: `make()` is called
 * again with the same `env`, the FS is re-resolved by pet name, and
 * the 9P server re-binds the same `FS_SOCKET_PATH`. The orchestrator
 * session (and its QEMU process) survives daemon restarts on its own
 * (`@endo/claude-orch` journals state to `$CLAUDE_ORCH_STATE_PATH`),
 * so reattach across restarts is automatic — the guest's mount
 * disconnects briefly when the UDS goes away and reconnects when the
 * bridge re-binds.
 *
 * Expected env:
 *   FS_NAME           Pet name of the FS capability on the powers
 *                     namespace. Resolved by `E(powers).lookup(...)`.
 *   FS_SOCKET_PATH    Absolute UDS path matching the orchestrator
 *                     session's `fsSocketPath`. The bridge unlinks
 *                     any stale node before listening so reincarnation
 *                     after an unclean shutdown is safe.
 *
 * Powers: the host agent (`powersName: '@agent'` from the factory's
 * `E(hostAgent).makeUnconfined(...)` call). The bridge needs nothing
 * beyond `lookup(name)`.
 *
 * @param {import('@endo/eventual-send').FarRef<any>} powers
 * @param {Promise<object> | object | undefined} _context
 * @param {object} [contextWrapper]
 * @returns {Promise<object>}
 */
export const make = async (powers, _context, contextWrapper = {}) => {
  const env = contextWrapper.env ?? process.env;
  const fsName = env.FS_NAME;
  const socketPath = env.FS_SOCKET_PATH;

  if (!fsName) {
    throw new Error('fs-bridge-module: FS_NAME required.');
  }
  if (!socketPath) {
    throw new Error('fs-bridge-module: FS_SOCKET_PATH required.');
  }

  const fs = await E(powers).lookup(fsName);
  if (!fs) {
    throw new Error(`fs-bridge-module: unknown FS pet name: ${fsName}`);
  }

  const bridge = makeFsBridge9p({ fs, socketPath });
  // Start eagerly so reincarnation is self-healing: by the time `make`
  // resolves, the UDS is listening at the original path.
  await E(bridge).start();
  return bridge;
};
harden(make);
