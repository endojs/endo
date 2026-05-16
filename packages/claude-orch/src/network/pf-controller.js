// @ts-check
/**
 * @import {
 *   NetworkController,
 *   NetworkOpts,
 *   NetAttachment,
 * } from '../../protocol.types.js'
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { deriveMac } from '../qemu/args.js';

const execFileAsync = promisify(execFile);

const ANCHOR_NAME = 'com.claude-orch';

/**
 * macOS network controller.
 *
 * v1 strategy: rely on a pre-installed pf anchor (see DESIGN.md §7.3) that
 * filters by the orchestrator's UID. The controller only verifies pf is
 * enabled and emits the SLIRP `-netdev user` args. Per-session network
 * state is not maintained; all sessions share the UID-based policy.
 *
 * Per-session granularity is deferred to v2 (vmnet + entitlement, see
 * DESIGN.md §12).
 *
 * @param {{
 *   exec?: (cmd: string, args: string[]) => Promise<{ stdout: string, stderr: string }>,
 * }} [opts]
 * @returns {NetworkController}
 */
export const makePfController = (opts = {}) => {
  const exec =
    opts.exec ??
    (async (cmd, args) => {
      const r = await execFileAsync(cmd, args);
      return /** @type {any} */ (r);
    });
  return harden({
    async initialize() {
      try {
        await exec('pfctl', ['-s', 'info']);
      } catch (e) {
        const err = /** @type {Error & { stderr?: string }} */ (e);
        const detail = err.stderr?.toString() ?? err.message;
        throw new Error(
          `pfctl not available or pf disabled. See DESIGN.md §7.3 for one-time setup. ${detail}`,
        );
      }
      // The anchor itself is installed at host setup time, not here.
      // We just verify it's loaded.
      try {
        await exec('pfctl', ['-a', ANCHOR_NAME, '-s', 'rules']);
      } catch (e) {
        const err = /** @type {Error & { stderr?: string }} */ (e);
        const detail = err.stderr?.toString() ?? err.message;
        throw new Error(
          `pf anchor "${ANCHOR_NAME}" not loaded. Install it per DESIGN.md §7.3. ${detail}`,
        );
      }
    },

    /**
     * @param {string} sessionId
     * @param {NetworkOpts} attachOpts
     * @returns {Promise<NetAttachment>}
     */
    async attachSession(sessionId, attachOpts) {
      if (attachOpts.mode === 'none') {
        return harden({ qemuArgs: [], cleanup: async () => {} });
      }
      const mac = deriveMac(sessionId);
      return harden({
        qemuArgs: [
          '-netdev',
          'user,id=net0,net=10.0.2.0/24',
          '-device',
          `virtio-net-pci,netdev=net0,mac=${mac}`,
        ],
        cleanup: async () => {},
      });
    },

    async detachSession(_sessionId) {
      // No per-session pf state in v1; UID-based rules in the anchor
      // cover every VM uniformly. v2 moves to vmnet + per-VM rules.
    },

    async shutdown() {
      // Anchor is installed at host setup time and outlives the
      // orchestrator process; nothing to tear down here.
    },
  });
};
harden(makePfController);
