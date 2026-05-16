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

const BRIDGE = 'claudebr0';
const BRIDGE_CIDR = '10.42.0.1/24';
const SUBNET = '10.42.0.0/24';

const NFT_RULESET = `
table inet claude {
  set private4 {
    type ipv4_addr
    flags interval
    elements = {
      10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16,
      100.64.0.0/10, 169.254.0.0/16, 127.0.0.0/8,
      224.0.0.0/4
    }
  }
  set private6 {
    type ipv6_addr
    flags interval
    elements = { fc00::/7, fe80::/10, ::1/128, ff00::/8 }
  }

  chain forward {
    type filter hook forward priority 0; policy drop;

    iifname "${BRIDGE}" ip  daddr @private4 reject with icmp  type net-unreachable
    iifname "${BRIDGE}" ip6 daddr @private6 reject with icmpv6 type no-route
    iifname "${BRIDGE}" oifname != "${BRIDGE}" accept

    oifname "${BRIDGE}" ct state established,related accept
  }

  chain input {
    type filter hook input priority 0; policy accept;
    iifname "${BRIDGE}" drop
  }

  chain postrouting {
    type nat hook postrouting priority 100;
    ip saddr ${SUBNET} oifname != "${BRIDGE}" masquerade
  }
}
`;

/**
 * @param {{
 *   exec?: (cmd: string, args: string[]) => Promise<{ stdout: string, stderr: string }>,
 *   execWithStdin?: (cmd: string, args: string[], stdin: string) => Promise<void>,
 * }} [opts]
 * @returns {NetworkController}
 */
export const makeNftablesController = (opts = {}) => {
  let initialized = false;

  const exec =
    opts.exec ??
    (async (cmd, args) => {
      const r = await execFileAsync(cmd, args);
      return /** @type {any} */ (r);
    });
  const execWithStdin =
    opts.execWithStdin ??
    ((cmd, args, stdin) =>
      new Promise((resolve, reject) => {
        const child = execFile(cmd, args);
        child.stdin?.end(stdin);
        child.once('exit', code =>
          code === 0
            ? resolve(undefined)
            : reject(new Error(`${cmd} exited ${code}`)),
        );
        child.once('error', reject);
      }));

  const run = async (
    /** @type {string} */ cmd,
    /** @type {string[]} */ args,
  ) => {
    try {
      return await exec(cmd, args);
    } catch (e) {
      const err = /** @type {Error & { stderr?: string }} */ (e);
      throw new Error(
        `${cmd} ${args.join(' ')}: ${err.stderr?.toString() ?? err.message}`,
      );
    }
  };

  const bridgeExists = async () => {
    try {
      await exec('ip', ['link', 'show', BRIDGE]);
      return true;
    } catch {
      return false;
    }
  };

  return harden({
    async initialize() {
      if (initialized) return;
      if (!(await bridgeExists())) {
        await run('ip', ['link', 'add', BRIDGE, 'type', 'bridge']);
        await run('ip', ['addr', 'add', BRIDGE_CIDR, 'dev', BRIDGE]);
        await run('ip', ['link', 'set', BRIDGE, 'up']);
      }
      // Idempotent: `nft -f -` will replace the named table atomically.
      await execWithStdin('nft', ['-f', '-'], NFT_RULESET);
      initialized = true;
    },

    /**
     * @param {string} sessionId
     * @param {NetworkOpts} attachOpts
     * @returns {Promise<NetAttachment>}
     */
    async attachSession(sessionId, attachOpts) {
      if (attachOpts.mode === 'none') {
        return harden({
          qemuArgs: [],
          cleanup: async () => {},
        });
      }
      const tap = `tap-${sessionId.slice(0, 8)}`;
      await run('ip', ['tuntap', 'add', tap, 'mode', 'tap']);
      await run('ip', ['link', 'set', tap, 'master', BRIDGE]);
      await run('ip', ['link', 'set', tap, 'up']);
      const mac = deriveMac(sessionId);
      return harden({
        qemuArgs: [
          '-netdev',
          `tap,id=net0,ifname=${tap},script=no,downscript=no`,
          '-device',
          `virtio-net-device,netdev=net0,mac=${mac}`,
        ],
        cleanup: async () => {
          try {
            await run('ip', ['link', 'delete', tap]);
          } catch {
            // Best-effort.
          }
        },
      });
    },

    /**
     * Per-session network state lives on the NetAttachment closure, so the
     * controller-level detach is a no-op. Callers invoke `cleanup` on the
     * attachment when tearing down.
     */
    async detachSession(_sessionId) {
      // no-op
    },

    async shutdown() {
      if (!initialized) return;
      initialized = false;
      try {
        await run('nft', ['delete', 'table', 'inet', 'claude']);
      } catch {
        // Already gone.
      }
      try {
        await run('ip', ['link', 'delete', BRIDGE]);
      } catch {
        // Already gone.
      }
    },
  });
};
harden(makeNftablesController);
