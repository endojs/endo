// @ts-nocheck
/* eslint-disable import/order */

import '@endo/init';
import test from 'ava';

import { makeNftablesController } from '../src/network/nftables-controller.js';
import { makePfController } from '../src/network/pf-controller.js';

/**
 * Build a recording exec stub. Tests inspect `calls` after init/attach.
 *
 * @param {{
 *   responses?: Record<string, { ok?: { stdout: string, stderr: string }, err?: Error }>,
 * }} [opts]
 */
const makeExecStub = ({ responses = {} } = {}) => {
  /** @type {{cmd: string, args: string[]}[]} */
  const calls = [];
  return {
    calls,
    exec: async (/** @type {string} */ cmd, /** @type {string[]} */ args) => {
      calls.push({ cmd, args });
      const key = `${cmd} ${args.join(' ')}`;
      const rule = responses[key] ?? responses[cmd];
      if (rule?.err) throw rule.err;
      return rule?.ok ?? { stdout: '', stderr: '' };
    },
  };
};

// -----------------------------------------------------------------------------
// nftables controller

test('nftables: initialize creates the bridge if missing and installs the table', async t => {
  /** @type {string} */
  let nftStdin = '';
  const stub = makeExecStub({
    responses: {
      'ip link show claudebr0': { err: new Error('not found') },
    },
  });
  const ctrl = makeNftablesController({
    exec: stub.exec,
    execWithStdin: async (_cmd, _args, stdin) => {
      nftStdin = stdin;
    },
  });
  await ctrl.initialize();
  const cmds = stub.calls.map(c => `${c.cmd} ${c.args.join(' ')}`);
  t.true(cmds.includes('ip link show claudebr0'));
  t.true(cmds.includes('ip link add claudebr0 type bridge'));
  t.true(cmds.includes('ip addr add 10.42.0.1/24 dev claudebr0'));
  t.true(cmds.includes('ip link set claudebr0 up'));
  t.regex(nftStdin, /table inet claude/);
  t.regex(nftStdin, /private4/);
  t.regex(nftStdin, /private6/);
  t.regex(nftStdin, /masquerade/);
});

test('nftables: initialize skips bridge creation if it already exists', async t => {
  const stub = makeExecStub({
    responses: {
      'ip link show claudebr0': { ok: { stdout: 'ok', stderr: '' } },
    },
  });
  const ctrl = makeNftablesController({
    exec: stub.exec,
    execWithStdin: async () => {},
  });
  await ctrl.initialize();
  const cmds = stub.calls.map(c => `${c.cmd} ${c.args.join(' ')}`);
  t.false(cmds.includes('ip link add claudebr0 type bridge'));
});

test('nftables: attachSession in egress mode allocates a tap and emits the right virtio-net args', async t => {
  const stub = makeExecStub();
  const ctrl = makeNftablesController({
    exec: stub.exec,
    execWithStdin: async () => {},
  });
  await ctrl.initialize();
  const attach = await ctrl.attachSession('abc1234567890def', {
    mode: 'egress',
  });
  const cmds = stub.calls.map(c => `${c.cmd} ${c.args.join(' ')}`);
  t.true(cmds.includes('ip tuntap add tap-abc12345 mode tap'));
  t.true(cmds.includes('ip link set tap-abc12345 master claudebr0'));
  t.true(cmds.includes('ip link set tap-abc12345 up'));
  t.true(
    attach.qemuArgs
      .join(' ')
      .includes('-netdev tap,id=net0,ifname=tap-abc12345'),
  );
  t.true(
    attach.qemuArgs.join(' ').includes('virtio-net-device,netdev=net0,mac=02:'),
  );
});

test('nftables: attachSession in none mode returns no qemu args', async t => {
  const stub = makeExecStub();
  const ctrl = makeNftablesController({
    exec: stub.exec,
    execWithStdin: async () => {},
  });
  await ctrl.initialize();
  const attach = await ctrl.attachSession('any', { mode: 'none' });
  t.deepEqual(attach.qemuArgs, []);
});

test('nftables: shutdown deletes the table and the bridge', async t => {
  const stub = makeExecStub();
  const ctrl = makeNftablesController({
    exec: stub.exec,
    execWithStdin: async () => {},
  });
  await ctrl.initialize();
  await ctrl.shutdown();
  const cmds = stub.calls.map(c => `${c.cmd} ${c.args.join(' ')}`);
  t.true(cmds.includes('nft delete table inet claude'));
  t.true(cmds.includes('ip link delete claudebr0'));
});

// -----------------------------------------------------------------------------
// pf controller

test('pf: initialize succeeds when pfctl is available and the anchor is loaded', async t => {
  const stub = makeExecStub({
    responses: {
      pfctl: { ok: { stdout: '', stderr: '' } },
    },
  });
  const ctrl = makePfController({ exec: stub.exec });
  await ctrl.initialize();
  const cmds = stub.calls.map(c => `${c.cmd} ${c.args.join(' ')}`);
  t.true(cmds.some(c => c.includes('pfctl -s info')));
  t.true(cmds.some(c => c.includes('pfctl -a com.claude-orch -s rules')));
});

test('pf: initialize fails clearly when pfctl is missing', async t => {
  const stub = makeExecStub({
    responses: {
      'pfctl -s info': { err: new Error('pfctl: command not found') },
    },
  });
  const ctrl = makePfController({ exec: stub.exec });
  await t.throwsAsync(ctrl.initialize(), {
    message: /pfctl not available or pf disabled/,
  });
});

test('pf: initialize fails clearly when the anchor is missing', async t => {
  const stub = makeExecStub({
    responses: {
      'pfctl -s info': { ok: { stdout: '', stderr: '' } },
      'pfctl -a com.claude-orch -s rules': {
        err: new Error('pfctl: no anchor'),
      },
    },
  });
  const ctrl = makePfController({ exec: stub.exec });
  await t.throwsAsync(ctrl.initialize(), {
    message: /pf anchor "com.claude-orch" not loaded/,
  });
});

test('pf: attachSession in egress mode emits SLIRP and a derived MAC', async t => {
  const ctrl = makePfController({
    exec: async () => ({ stdout: '', stderr: '' }),
  });
  const attach = await ctrl.attachSession('abc1234567890def', {
    mode: 'egress',
  });
  t.true(
    attach.qemuArgs.join(' ').includes('-netdev user,id=net0,net=10.0.2.0/24'),
  );
  t.regex(attach.qemuArgs.join(' '), /mac=02:/);
});

test('pf: attachSession in none mode returns no qemu args', async t => {
  const ctrl = makePfController({
    exec: async () => ({ stdout: '', stderr: '' }),
  });
  const attach = await ctrl.attachSession('any', { mode: 'none' });
  t.deepEqual(attach.qemuArgs, []);
});
