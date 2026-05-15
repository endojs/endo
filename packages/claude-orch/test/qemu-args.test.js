// @ts-check
/* eslint-disable import/order */

import '@endo/init';
import test from 'ava';

import { buildQemuArgs, deriveMac, qemuBinaryFor } from '../src/qemu/args.js';

const baseConfig = {
  socketPath: '/x',
  imageDir: '/images',
  sessionDir: '/sessions',
  brokerSocketPath: '/x',
  defaults: { arch: 'x86_64', vcpus: 4, memMB: 4096 },
  bootDeadlineMs: 30000,
  heartbeatTimeoutMs: 60000,
};

const baseRecord = {
  id: 'abc1234567890ab',
  state: 'pending',
  request: { network: 'egress', attachMode: 'stream' },
  bootNonce: 'a'.repeat(64),
  bootNonceUsed: false,
  sessionDir: '/sessions/abc',
  fsSocketPath: '/sessions/abc/fs.sock',
  ctlSocketPath: '/sessions/abc/ctl.sock',
  agentSocketPath: '/sessions/abc/agent.sock',
  stdioSocketPath: '/sessions/abc/stdio.sock',
  qmpSocketPath: '/sessions/abc/qmp.sock',
  attachSocketPath: '/sessions/abc/attach.sock',
  createdAt: '2026-05-15T00:00:00Z',
};

test('buildQemuArgs emits the chardev/virtserialport quartet from Appendix A', t => {
  const args = buildQemuArgs({
    arch: 'x86_64',
    record: baseRecord,
    config: baseConfig,
    netArgs: ['-netdev', 'foo', '-device', 'bar'],
  });
  const j = args.join(' ');
  t.regex(j, /-chardev socket,id=ctl,path=\/sessions\/abc\/ctl\.sock/);
  t.regex(j, /-chardev socket,id=fs,path=\/sessions\/abc\/fs\.sock,server=off,reconnect=1/);
  t.regex(j, /-chardev socket,id=agent,path=\/sessions\/abc\/agent\.sock/);
  t.regex(j, /-chardev socket,id=stdio,path=\/sessions\/abc\/stdio\.sock/);
  t.regex(j, /virtserialport,chardev=ctl,name=orchestrator/);
  t.regex(j, /virtserialport,chardev=fs,name=workspace/);
  t.regex(j, /virtserialport,chardev=agent,name=agent/);
  t.regex(j, /virtserialport,chardev=stdio,name=stdio/);
  t.regex(j, /-qmp unix:\/sessions\/abc\/qmp\.sock/);
  t.true(args.includes('-netdev'));
});

test('buildQemuArgs threads the boot nonce and session id onto the cmdline', t => {
  const args = buildQemuArgs({
    arch: 'x86_64',
    record: baseRecord,
    config: baseConfig,
    netArgs: [],
  });
  const append = args[args.indexOf('-append') + 1];
  t.regex(append, /claude\.session_id=abc1234567890ab/);
  t.regex(append, /claude\.boot_nonce=a{64}/);
});

test('buildQemuArgs selects machine type and devices per arch', t => {
  const x86 = buildQemuArgs({ arch: 'x86_64', record: baseRecord, config: baseConfig, netArgs: [] }).join(' ');
  const arm = buildQemuArgs({ arch: 'aarch64', record: baseRecord, config: baseConfig, netArgs: [] }).join(' ');
  t.regex(x86, /microvm,acpi=off,pic=off,pit=off,rtc=on/);
  t.regex(arm, /virt,gic-version=3/);
  t.regex(x86, /virtio-blk-device,drive=rootfs/);
  t.regex(arm, /virtio-blk-pci,drive=rootfs/);
});

test('qemuBinaryFor picks the right binary', t => {
  t.is(qemuBinaryFor('x86_64'), 'qemu-system-x86_64');
  t.is(qemuBinaryFor('aarch64'), 'qemu-system-aarch64');
});

test('deriveMac produces a 02:.. locally-administered unicast MAC', t => {
  const mac = deriveMac('abc1234567890def');
  t.regex(mac, /^02:[0-9a-f]{2}(:[0-9a-f]{2}){4}$/);
  t.is(deriveMac('abc1234567890def'), deriveMac('abc1234567890def'));
});
