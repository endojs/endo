// @ts-check
/**
 * Tests that every E(channel).method(...) call pattern used by the outliner
 * (and its dependencies: send-form, channel-utils) matches the daemon's
 * ChannelInterface and ChannelMemberInterface guards.
 *
 * These tests import the real interface guards and validate representative
 * argument tuples against them, catching arity and shape mismatches at test
 * time rather than at runtime.
 */

import '@endo/init/debug.js';

import test from 'ava';
import {
  M,
  matches,
  getInterfaceGuardPayload,
  getMethodGuardPayload,
} from '@endo/patterns';
import {
  ChannelInterface,
  ChannelMemberInterface,
} from '../../../daemon/src/interfaces.js';

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Extract argGuards and optionalArgGuards for a method from an interface.
 *
 * @param {unknown} iface - M.interface guard
 * @param {string} methodName
 * @returns {{ argGuards: unknown[], optionalArgGuards: unknown[], maxArgs: number, minArgs: number }}
 */
const getMethodArgInfo = (iface, methodName) => {
  const { methodGuards } = getInterfaceGuardPayload(iface);
  const methodGuard = methodGuards[methodName];
  if (!methodGuard) {
    throw new Error(`No method guard for ${methodName}`);
  }
  const payload = getMethodGuardPayload(methodGuard);
  const argGuards = payload.argGuards || [];
  const optionalArgGuards = payload.optionalArgGuards || [];
  return {
    argGuards,
    optionalArgGuards,
    minArgs: argGuards.length,
    maxArgs: argGuards.length + optionalArgGuards.length,
  };
};

/**
 * Validate that a set of arguments matches a method's guard.
 * Builds a combined guard tuple and checks each arg against its guard.
 *
 * @param {unknown} iface
 * @param {string} methodName
 * @param {unknown[]} args
 * @returns {{ ok: boolean, error?: string }}
 */
const validateArgs = (iface, methodName, args) => {
  const { argGuards, optionalArgGuards, minArgs, maxArgs } = getMethodArgInfo(
    iface,
    methodName,
  );

  if (args.length < minArgs) {
    return {
      ok: false,
      error: `${methodName}: too few args (${args.length} < ${minArgs})`,
    };
  }
  if (args.length > maxArgs) {
    return {
      ok: false,
      error: `${methodName}: too many args (${args.length} > ${maxArgs})`,
    };
  }

  const allGuards = [...argGuards, ...optionalArgGuards];
  for (let i = 0; i < args.length; i += 1) {
    if (!matches(harden(args[i]), allGuards[i])) {
      return {
        ok: false,
        error: `${methodName}: arg ${i} does not match guard`,
      };
    }
  }
  return { ok: true };
};

/**
 * Run validation against both ChannelInterface and ChannelMemberInterface.
 * Both must accept the call pattern.
 *
 * @param {object} t - ava test context
 * @param {string} methodName
 * @param {unknown[]} args
 * @param {string} callSite - description of where this call pattern is used
 */
const assertCallValid = (t, methodName, args, callSite) => {
  for (const [label, iface] of [
    ['ChannelInterface', ChannelInterface],
    ['ChannelMemberInterface', ChannelMemberInterface],
  ]) {
    const result = validateArgs(iface, methodName, args);
    t.true(
      result.ok,
      `${callSite} → ${label}.${methodName}: ${result.error || 'ok'}`,
    );
  }
};

// ─── Tests: outliner-component.js ──────────────────────────────────────

test('outliner: followMessages() — no args', t => {
  assertCallValid(
    t,
    'followMessages',
    [],
    'outliner-component.js: followMessages()',
  );
});

test('outliner: post() deletion — 6 args with replyType', t => {
  // E(channel).post([''], [], [], String(message.number), [], 'deletion')
  assertCallValid(
    t,
    'post',
    [[''], [], [], '42', [], 'deletion'],
    'outliner-component.js: delete button',
  );
});

// ─── Tests: send-form.js (channel mode) ────────────────────────────────

test('send-form: post() standard message — 5 args, no replyType', t => {
  // E(channelRef).post(messageStrings, edgeNames, petNames, replyTo, ids)
  assertCallValid(
    t,
    'post',
    [
      ['Hello world'],
      ['attachment'],
      ['my-file'],
      undefined,
      ['formula-id-abc'],
    ],
    'send-form.js: standard channel post',
  );
});

test('send-form: post() with replyType — 6 args', t => {
  // E(channelRef).post(messageStrings, edgeNames, petNames, replyTo, ids, sendReplyType)
  assertCallValid(
    t,
    'post',
    [['Edited text'], [], [], '5', [], 'edit'],
    'send-form.js: channel post with replyType=edit',
  );
});

test('send-form: post() with replyTo but no replyType — 5 args', t => {
  assertCallValid(
    t,
    'post',
    [['Reply text'], [], [], '10', []],
    'send-form.js: reply without replyType',
  );
});

test('send-form: post() with no replyTo, no replyType — 5 args with undefined', t => {
  assertCallValid(
    t,
    'post',
    [['Hello'], [], [], undefined, []],
    'send-form.js: top-level post',
  );
});

test('send-form: post() with pro replyType', t => {
  assertCallValid(
    t,
    'post',
    [['I agree because...'], [], [], '3', [], 'pro'],
    'send-form.js: pro reply',
  );
});

test('send-form: post() with con replyType', t => {
  assertCallValid(
    t,
    'post',
    [['I disagree because...'], [], [], '3', [], 'con'],
    'send-form.js: con reply',
  );
});

test('send-form: post() with evidence replyType', t => {
  assertCallValid(
    t,
    'post',
    [['See this source...'], ['doc'], ['my-doc'], '3', ['id-123'], 'evidence'],
    'send-form.js: evidence reply',
  );
});

test('send-form: getHopInfo() — no args', t => {
  assertCallValid(t, 'getHopInfo', [], 'send-form.js: getHopInfo()');
});

test('send-form: followHeatEvents() — no args', t => {
  assertCallValid(
    t,
    'followHeatEvents',
    [],
    'send-form.js: followHeatEvents()',
  );
});

test('send-form: getHeatConfig() — no args', t => {
  assertCallValid(t, 'getHeatConfig', [], 'send-form.js: getHeatConfig()');
});

// ─── Tests: channel-utils.js ───────────────────────────────────────────

test('channel-utils: getProposedName() — no args', t => {
  assertCallValid(
    t,
    'getProposedName',
    [],
    'channel-utils.js: getProposedName()',
  );
});

test('channel-utils: getMember(memberId) — 1 string arg', t => {
  assertCallValid(t, 'getMember', ['42'], 'channel-utils.js: getMember()');
});

// ─── Tests: arity boundaries ───────────────────────────────────────────

test('post() rejects 7 args (too many)', t => {
  const info = getMethodArgInfo(ChannelInterface, 'post');
  t.true(info.maxArgs < 7, `post maxArgs should be < 7, got ${info.maxArgs}`);
});

test('post() requires at least 3 args', t => {
  const info = getMethodArgInfo(ChannelInterface, 'post');
  t.is(info.minArgs, 3, 'post requires 3 mandatory args');
});

test('post() accepts up to 6 args', t => {
  const info = getMethodArgInfo(ChannelInterface, 'post');
  t.is(info.maxArgs, 6, 'post accepts up to 6 args (3 required + 3 optional)');
});

// ─── Tests: ChannelMemberInterface parity ──────────────────────────────

test('ChannelMemberInterface has same post arity as ChannelInterface', t => {
  const channelInfo = getMethodArgInfo(ChannelInterface, 'post');
  const memberInfo = getMethodArgInfo(ChannelMemberInterface, 'post');
  t.is(channelInfo.minArgs, memberInfo.minArgs, 'same minArgs');
  t.is(channelInfo.maxArgs, memberInfo.maxArgs, 'same maxArgs');
});

test('both interfaces expose all methods used by outliner', t => {
  const requiredMethods = [
    'post',
    'followMessages',
    'getProposedName',
    'getMemberId',
    'getMember',
    'getHeatConfig',
    'getHopInfo',
    'followHeatEvents',
  ];

  const channelPayload = getInterfaceGuardPayload(ChannelInterface);
  const memberPayload = getInterfaceGuardPayload(ChannelMemberInterface);

  for (const method of requiredMethods) {
    t.truthy(
      channelPayload.methodGuards[method],
      `ChannelInterface has ${method}`,
    );
    t.truthy(
      memberPayload.methodGuards[method],
      `ChannelMemberInterface has ${method}`,
    );
  }
});
