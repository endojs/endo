// @ts-check
/**
 * @import {
 *   Arch,
 *   OrchestratorConfig,
 *   SessionRecord,
 * } from '../../protocol.types.js'
 * @import { ChildProcess } from 'node:child_process'
 */

import { spawn } from 'node:child_process';

import { buildQemuArgs, qemuBinaryFor } from './args.js';

/**
 * @typedef {object} VmHandle
 * @property {ChildProcess} child
 * @property {Promise<number>} exitCode
 * @property {(signal?: NodeJS.Signals) => void} kill
 */

/**
 * Spawn QEMU for a session.
 *
 * The QEMU process inherits stderr (so kernel/QEMU diagnostics appear in
 * the orchestrator log) but its stdout is dropped — the kernel console
 * goes to hvc0 which we don't attach to the parent. If the process needs
 * to be debugged, hook a console chardev from the API.
 *
 * @param {{
 *   arch: Arch,
 *   record: SessionRecord,
 *   config: OrchestratorConfig,
 *   netArgs: readonly string[],
 * }} opts
 * @returns {VmHandle}
 */
export const spawnVm = ({ arch, record, config, netArgs }) => {
  const args = buildQemuArgs({ arch, record, config, netArgs });
  const binary = qemuBinaryFor(arch);

  const child = spawn(binary, args, {
    stdio: ['ignore', 'ignore', 'inherit'],
    windowsHide: true,
  });

  const exitCode = /** @type {Promise<number>} */ (
    new Promise(resolve => {
      child.once('exit', code => resolve(typeof code === 'number' ? code : -1));
    })
  );

  return harden({
    child,
    exitCode,
    kill: (signal = 'SIGTERM') => {
      if (!child.killed) child.kill(signal);
    },
  });
};
harden(spawnVm);
