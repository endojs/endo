// @ts-check
/// <reference types="ses"/>
/* global setTimeout, clearTimeout */

import { makeError, q, X } from '@endo/errors';
import { makeExo } from '@endo/exo';

import { ShellInterface } from './interfaces.js';

/**
 * @import { Spawner, ProcessLike } from '@endo/host-spawner'
 * @import { EndoShell, ShellPolicy } from './types.js'
 */

/**
 * Drain an async-iterable byte stream into a UTF-8 string, bounded to
 * `maxBytes`.  Once the cap is reached the remaining chunks are still read to
 * EOF (so the child never blocks on a full pipe) but discarded, and the result
 * is flagged `truncated`.  A stream that throws mid-read — the usual shape when
 * the process is killed — resolves with whatever was accumulated.
 *
 * @param {AsyncIterable<Uint8Array> | null | undefined} stream
 * @param {number} maxBytes
 * @returns {Promise<{ text: string, truncated: boolean }>}
 */
const drainBounded = async (stream, maxBytes) => {
  if (stream === null || stream === undefined) {
    return { text: '', truncated: false };
  }
  /** @type {Uint8Array[]} */
  const kept = [];
  let total = 0;
  let truncated = false;
  await null;
  try {
    for await (const chunk of stream) {
      const bytes =
        chunk instanceof Uint8Array
          ? chunk
          : new TextEncoder().encode(String(chunk));
      if (truncated) {
        // Keep draining to EOF but discard — bounds memory, not the pipe.
        continue; // eslint-disable-line no-continue
      }
      if (total + bytes.length <= maxBytes) {
        kept.push(bytes);
        total += bytes.length;
      } else {
        const remaining = maxBytes - total;
        if (remaining > 0) {
          kept.push(bytes.subarray(0, remaining));
          total += remaining;
        }
        truncated = true;
      }
    }
  } catch {
    // The process was likely killed mid-stream; return the partial capture.
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of kept) {
    buf.set(c, offset);
    offset += c.length;
  }
  return { text: new TextDecoder().decode(buf), truncated };
};

/**
 * Build the portable `Shell` exo over a working directory, a formula-owned
 * policy, and an injected `Spawner` engine (host or sandbox — chosen host-side
 * and invisible on this surface).  The exo enforces the guest-facing bounds:
 * allowlist-before-spawn, argv-only (no shell string), the policy's sanitized
 * env (carried by the spawner's defaults plus `policy.env`), a per-stream
 * output cap, and a timeout that narrows-only per call.  `cwd` and the env
 * passlist are host-private and never surface through `inspect()`.
 *
 * A read-only mount cannot bound a child process's OS-level write authority, so
 * a "read-only shell" would misrepresent the authority actually granted; the
 * maker refuses one outright (design § Construction, point 3).
 *
 * @param {object} powers
 * @param {string} powers.cwd  Host working directory for spawned children.
 * @param {ShellPolicy & { env?: Record<string, string> }} powers.policy
 * @param {Spawner} powers.spawner
 * @param {boolean} [powers.readOnly]
 * @returns {EndoShell}
 */
export const makeShell = ({ cwd, policy, spawner, readOnly = false }) => {
  if (readOnly) {
    throw makeError(
      X`Shell cannot be constructed over a read-only mount: a child process holds OS-level write authority a read-only mount cannot bound`,
    );
  }
  if (typeof cwd !== 'string' || cwd.length === 0) {
    throw makeError(X`makeShell: cwd must be a non-empty host path string`);
  }
  const {
    allowedCommands,
    timeoutMs: policyTimeoutMs,
    maxOutputBytes,
    env = {},
  } = policy;
  if (
    !Array.isArray(allowedCommands) ||
    allowedCommands.length === 0 ||
    !allowedCommands.every(c => typeof c === 'string' && c.length > 0)
  ) {
    throw makeError(
      X`makeShell: policy.allowedCommands must be a non-empty array of command-name strings`,
    );
  }
  if (!Number.isInteger(policyTimeoutMs) || policyTimeoutMs <= 0) {
    throw makeError(X`makeShell: policy.timeoutMs must be a positive integer`);
  }
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes <= 0) {
    throw makeError(
      X`makeShell: policy.maxOutputBytes must be a positive integer`,
    );
  }

  const allowed = new Set(allowedCommands);
  // Frozen copies, so a later mutation of the caller's arrays cannot widen
  // the allowlist or alter the child env after construction.
  const allowedList = harden([...allowedCommands]);
  const childEnv = harden({ ...env });

  const exo = makeExo('Shell', ShellInterface, {
    /**
     * Reveal only the policy the design's `ShellPolicy` names — never `cwd`,
     * `env`, or the baked `searchPath`, all of which carry host paths.
     */
    async inspect() {
      return harden({
        allowedCommands: allowedList,
        timeoutMs: policyTimeoutMs,
        maxOutputBytes,
      });
    },

    /**
     * @param {string} command
     * @param {string[]} args
     * @param {{ timeoutMs?: number }} [options]
     */
    async exec(command, args, options = {}) {
      if (!allowed.has(command)) {
        throw makeError(
          X`Shell.exec: command ${q(command)} is not in the allowlist`,
        );
      }
      // A per-call timeout may only narrow the policy value, never widen it.
      const requested = options.timeoutMs;
      const effectiveTimeoutMs =
        requested !== undefined && requested > 0
          ? Math.min(policyTimeoutMs, requested)
          : policyTimeoutMs;

      // Argv only — the program name is argv[0], never a shell string, and
      // `shell: false` forbids the spawner from wrapping it in `/bin/sh -c`.
      const argv = harden([command, ...args]);
      const proc = await spawner(argv, {
        cwd,
        env: childEnv,
        shell: false,
      });

      let timedOut = false;
      let killed = false;
      const requestKill = () => {
        if (!killed) {
          killed = true;
          void proc.kill('SIGTERM');
        }
      };
      const timer = setTimeout(() => {
        timedOut = true;
        requestKill();
      }, effectiveTimeoutMs);

      /** @type {{ text: string, truncated: boolean }} */
      let outRes;
      /** @type {{ text: string, truncated: boolean }} */
      let errRes;
      /** @type {{ code: number | null, signal: string | null }} */
      let status;
      try {
        [outRes, errRes, status] = await Promise.all([
          drainBounded(proc.stdout, maxOutputBytes),
          drainBounded(proc.stderr, maxOutputBytes),
          proc.wait(),
        ]);
      } finally {
        clearTimeout(timer);
      }

      const { code } = status;
      let { signal } = status;
      // A timeout kill may race the natural exit; surface the kill signal when
      // the runtime reported neither a code nor a signal.
      if (timedOut && code === null && signal === null) {
        signal = 'SIGTERM';
      }

      return harden({
        stdout: outRes.text,
        stderr: errRes.text,
        exitCode: code,
        signal,
        truncated: outRes.truncated || errRes.truncated,
      });
    },
  });

  return /** @type {EndoShell} */ (exo);
};
harden(makeShell);
