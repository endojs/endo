// @ts-check
/**
 * @import {
 *   Arch,
 *   OrchestratorConfig,
 *   SessionRecord,
 * } from '../../protocol.types.d.ts'
 */

import path from 'node:path';
import process from 'node:process';

/**
 * Build the argv for `qemu-system-<arch>` for one session.
 *
 * Mirrors Appendix A of DESIGN.md. The argv is platform-dependent in two
 * places: the accelerator (`hvf` on darwin, `kvm` on linux) and the machine
 * type (`microvm` is x86_64-only; arm64 uses `virt`). Network args come
 * from the network controller (network/index.js) and are appended by the
 * caller.
 *
 * @param {{
 *   arch: Arch,
 *   record: SessionRecord,
 *   config: OrchestratorConfig,
 *   netArgs: readonly string[],
 * }} opts
 * @returns {string[]}
 */
export const buildQemuArgs = ({ arch, record, config, netArgs }) => {
  const platform = process.platform;
  const accel = platform === 'darwin' ? 'hvf' : 'kvm';
  const machine =
    arch === 'x86_64'
      ? 'microvm,acpi=off,pic=off,pit=off,rtc=on'
      : 'virt,gic-version=3';
  const kernelImage =
    arch === 'x86_64'
      ? path.join(config.imageDir, 'vmlinux-x86_64')
      : path.join(config.imageDir, 'Image-arm64');
  const rootfsImage =
    arch === 'x86_64'
      ? path.join(config.imageDir, 'rootfs-x86_64.raw')
      : path.join(config.imageDir, 'rootfs-arm64.raw');

  const vcpus = record.request.resources?.vcpus ?? config.defaults.vcpus;
  const memMB = record.request.resources?.memMB ?? config.defaults.memMB;

  const blkDevice = arch === 'x86_64' ? 'virtio-blk-device' : 'virtio-blk-pci';
  const serialDevice =
    arch === 'x86_64' ? 'virtio-serial-device' : 'virtio-serial-pci';

  const args = [
    '-machine',
    machine,
    '-cpu',
    'host',
    '-accel',
    accel,
    '-smp',
    String(vcpus),
    '-m',
    String(memMB),
    '-nodefaults',
    '-no-user-config',
    '-no-reboot',
    '-kernel',
    kernelImage,
    '-append',
    [
      'console=hvc0',
      'root=/dev/vda',
      'ro',
      'rootfstype=ext4',
      'quiet',
      `claude.session_id=${record.id}`,
      `claude.boot_nonce=${record.bootNonce}`,
    ].join(' '),
    '-drive',
    `id=rootfs,file=${rootfsImage},format=raw,if=none,readonly=on`,
    '-device',
    `${blkDevice},drive=rootfs`,
    '-device',
    serialDevice,
    '-chardev',
    `socket,id=ctl,path=${record.ctlSocketPath},server=on,wait=off`,
    '-device',
    'virtserialport,chardev=ctl,name=orchestrator',
    '-chardev',
    `socket,id=fs,path=${record.fsSocketPath},server=off,reconnect=1`,
    '-device',
    'virtserialport,chardev=fs,name=workspace',
    '-chardev',
    `socket,id=agent,path=${record.agentSocketPath},server=on,wait=off`,
    '-device',
    'virtserialport,chardev=agent,name=agent',
    '-chardev',
    `socket,id=stdio,path=${record.stdioSocketPath},server=on,wait=off`,
    '-device',
    'virtserialport,chardev=stdio,name=stdio',
    ...netArgs,
    '-qmp',
    `unix:${record.qmpSocketPath},server=on,wait=off`,
  ];
  return args;
};
harden(buildQemuArgs);

/**
 * Pick the QEMU binary name for the requested arch.
 *
 * @param {Arch} arch
 * @returns {string}
 */
export const qemuBinaryFor = arch =>
  arch === 'x86_64' ? 'qemu-system-x86_64' : 'qemu-system-aarch64';
harden(qemuBinaryFor);

/**
 * Derive a stable MAC from a session id. Locally administered, unicast.
 *
 * @param {string} sessionId
 * @returns {string}
 */
export const deriveMac = sessionId => {
  // 02:<6 hex from session id>
  const hex = sessionId
    .replace(/[^0-9a-f]/gi, '')
    .slice(0, 10)
    .padEnd(10, '0');
  return `02:${hex.slice(0, 2)}:${hex.slice(2, 4)}:${hex.slice(4, 6)}:${hex.slice(6, 8)}:${hex.slice(8, 10)}`;
};
harden(deriveMac);
