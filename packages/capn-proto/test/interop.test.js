// @ts-nocheck
/* global Buffer */
// Byte-level interop test against the reference Cap'n Proto C++
// implementation. Runs only when the `capnp` CLI is on PATH; otherwise the
// suite exits cleanly with a single skip so the rest of CI can proceed.
//
// For each rpc.capnp Message variant we:
//   1. Encode a fixture using our encoder.
//   2. Pipe the bytes through `capnp decode rpc.capnp Message` (the C++
//      reference implementation) and parse the resulting text.
//   3. Assert the parsed text contains the expected field values.
//
// We also do the reverse: encode a known message via `capnp encode` and
// confirm our decoder reads it back identically.
//
// Both directions catch wire-format regressions including offsets, default
// XOR, union discriminator placement, far-pointer landing pads, framing,
// and pointer kind tags.

import test from '@endo/ses-ava/test.js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  encodeBootstrap,
  encodeCall,
  encodeReturn,
  encodeFinish,
  encodeRelease,
  encodeResolve,
  encodeDisembargo,
  encodeProvide,
  encodeAccept,
  encodeAbort,
  decodeMessage,
} from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const RPC_CAPNP = join(here, '..', 'rpc.capnp');

const haveCapnp = (() => {
  const r = spawnSync('capnp', ['--version'], { encoding: 'utf8' });
  return r.status === 0;
})();

const runCapnpDecode = framed => {
  const r = spawnSync('capnp', ['decode', RPC_CAPNP, 'Message'], {
    input: Buffer.from(framed),
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw Error(`capnp decode failed: ${r.stderr || r.stdout}`);
  }
  // capnp decode appends an "*** ERROR ..." block when there is residual
  // input; trim everything after a sentinel newline if present.
  const out = r.stdout.split('*** ERROR')[0];
  return out.trim();
};

const runCapnpEncode = text => {
  const r = spawnSync('capnp', ['encode', RPC_CAPNP, 'Message'], {
    input: text,
  });
  if (r.status !== 0) {
    throw Error(
      `capnp encode failed: ${r.stderr?.toString() || r.stdout?.toString()}`,
    );
  }
  // r.stdout is a Buffer; copy out the bytes into a fresh ArrayBuffer.
  const stdout = /** @type {Buffer} */ (r.stdout);
  const out = new ArrayBuffer(stdout.length);
  new Uint8Array(out).set(stdout);
  return out;
};

if (!haveCapnp) {
  test('SKIP: capnp CLI not available, skipping interop tests', t => {
    t.pass('install `capnproto` to run interop tests');
  });
} else {
  test('interop: Bootstrap decoded by capnp CLI', t => {
    const framed = encodeBootstrap({ questionId: 42 });
    const out = runCapnpDecode(framed);
    t.regex(out, /bootstrap/);
    t.regex(out, /questionId = 42/);
  });

  test('interop: Call decoded by capnp CLI matches every field', t => {
    const framed = encodeCall({
      questionId: 7,
      target: { kind: 'importedCap', id: 3 },
      interfaceId: 0xa1b2c3d4e5f60718n,
      methodId: 11,
      params: {
        contentBytes: new Uint8Array([1, 2, 3]),
        capTable: [{ kind: 'senderHosted', id: 9 }],
      },
    });
    const out = runCapnpDecode(framed);
    t.regex(out, /questionId = 7/);
    t.regex(out, /methodId = 11/);
    t.regex(out, /interfaceId = 11651590505119483672/); // 0xa1b2c3d4e5f60718
    t.regex(out, /importedCap = 3/);
    t.regex(out, /senderHosted = 9/);
    t.regex(out, /sendResultsTo = \(caller = void\)/);
    t.regex(out, /allowThirdPartyTailCall = false/);
  });

  test('interop: Return with results decoded; releaseParamCaps default true', t => {
    const framed = encodeReturn({
      answerId: 12,
      result: {
        kind: 'results',
        payload: { contentBytes: new Uint8Array(0), capTable: [] },
      },
    });
    const out = runCapnpDecode(framed);
    t.regex(out, /answerId = 12/);
    // We didn't pass releaseParamCaps so it defaults to true; verify the
    // XOR-against-default storage encodes that correctly.
    t.regex(out, /releaseParamCaps = true/);
  });

  test('interop: Return with releaseParamCaps=false writes 1-bit on wire', t => {
    const framed = encodeReturn({
      answerId: 1,
      releaseParamCaps: false,
      result: {
        kind: 'results',
        payload: { contentBytes: new Uint8Array(0), capTable: [] },
      },
    });
    const out = runCapnpDecode(framed);
    t.regex(out, /releaseParamCaps = false/);
  });

  test('interop: Finish defaults true for both bool fields', t => {
    const framed = encodeFinish({ questionId: 8 });
    const out = runCapnpDecode(framed);
    t.regex(out, /questionId = 8/);
    t.regex(out, /releaseResultCaps = true/);
    t.regex(out, /requireEarlyCancellationWorkaround = true/);
  });

  test('interop: Release decoded with id and refcount', t => {
    const framed = encodeRelease({ id: 6, referenceCount: 3 });
    const out = runCapnpDecode(framed);
    t.regex(out, /id = 6/);
    t.regex(out, /referenceCount = 3/);
  });

  test('interop: Resolve cap decoded as senderHosted', t => {
    const framed = encodeResolve({
      promiseId: 4,
      payload: { kind: 'cap', cap: { kind: 'senderHosted', id: 17 } },
    });
    const out = runCapnpDecode(framed);
    t.regex(out, /promiseId = 4/);
    t.regex(out, /senderHosted = 17/);
  });

  test('interop: Resolve exception decoded with reason and type', t => {
    const framed = encodeResolve({
      promiseId: 9,
      payload: { kind: 'exception', exception: { type: 2, reason: 'lost' } },
    });
    const out = runCapnpDecode(framed);
    t.regex(out, /promiseId = 9/);
    t.regex(out, /reason = "lost"/);
    t.regex(out, /type = disconnected/);
  });

  test('interop: Disembargo senderLoopback decoded with correct context', t => {
    const framed = encodeDisembargo({
      target: { kind: 'importedCap', id: 1 },
      context: { kind: 'senderLoopback', id: 99 },
    });
    const out = runCapnpDecode(framed);
    t.regex(out, /senderLoopback = 99/);
    t.regex(out, /importedCap = 1/);
  });

  test('interop: Disembargo receiverLoopback decoded', t => {
    const framed = encodeDisembargo({
      target: { kind: 'importedCap', id: 1 },
      context: { kind: 'receiverLoopback', id: 99 },
    });
    const out = runCapnpDecode(framed);
    t.regex(out, /receiverLoopback = 99/);
  });

  test('interop: Disembargo accept (Void variant) decoded', t => {
    const framed = encodeDisembargo({
      target: { kind: 'importedCap', id: 1 },
      context: { kind: 'accept' },
    });
    const out = runCapnpDecode(framed);
    t.regex(out, /accept = void/);
  });

  test('interop: Disembargo provide carries provide question id', t => {
    const framed = encodeDisembargo({
      target: { kind: 'importedCap', id: 1 },
      context: { kind: 'provide', questionId: 42 },
    });
    const out = runCapnpDecode(framed);
    t.regex(out, /provide = 42/);
  });

  test('interop: Provide decoded', t => {
    const framed = encodeProvide({
      questionId: 10,
      target: { kind: 'importedCap', id: 7 },
      recipient: new Uint8Array([1, 2, 3]),
    });
    const out = runCapnpDecode(framed);
    t.regex(out, /questionId = 10/);
    t.regex(out, /importedCap = 7/);
  });

  test('interop: Accept decoded with embargo flag', t => {
    const framed = encodeAccept({
      questionId: 22,
      provision: new Uint8Array([4, 5, 6]),
      embargo: true,
    });
    const out = runCapnpDecode(framed);
    t.regex(out, /questionId = 22/);
    t.regex(out, /embargo = true/);
  });

  test('interop: Abort variant is an Exception inline', t => {
    const framed = encodeAbort({
      exception: { type: 2, reason: 'shutdown' },
    });
    const out = runCapnpDecode(framed);
    t.regex(out, /reason = "shutdown"/);
    t.regex(out, /type = disconnected/);
  });

  test('interop: PromisedAnswer transform path with field ordinals decoded', t => {
    const framed = encodeCall({
      questionId: 1,
      target: {
        kind: 'promisedAnswer',
        questionId: 99,
        transform: [
          { op: 'getPointerField', fieldOrdinal: 5 },
          { op: 'getPointerField', fieldOrdinal: 7 },
        ],
      },
      interfaceId: 0n,
      methodId: 0,
      params: { contentBytes: new Uint8Array(0), capTable: [] },
    });
    const out = runCapnpDecode(framed);
    // Two getPointerField ops should both appear with the right ordinals.
    t.regex(out, /getPointerField = 5/);
    t.regex(out, /getPointerField = 7/);
    t.regex(out, /questionId = 99/);
  });

  test('interop reverse: capnp encodes a Bootstrap → our decoder reads it', t => {
    const text = '( bootstrap = (questionId = 1234) )';
    const framed = runCapnpEncode(text);
    const m = decodeMessage(framed);
    t.is(m.type, 'bootstrap');
    t.is(m.questionId, 1234);
  });

  test('interop reverse: capnp encodes a Call → our decoder reads it', t => {
    const text = `( call = (
      questionId = 7,
      target = (importedCap = 3),
      interfaceId = 11651590505119483672,
      methodId = 11,
      params = ( capTable = [(senderHosted = 9)] ),
      sendResultsTo = (caller = void) ) )`;
    const framed = runCapnpEncode(text);
    const m = decodeMessage(framed);
    t.is(m.type, 'call');
    t.is(m.questionId, 7);
    t.is(m.methodId, 11);
    t.is(m.interfaceId, 0xa1b2c3d4e5f60718n);
    t.is(m.target.kind, 'importedCap');
    t.is(m.target.id, 3);
    t.is(m.params.capTable.length, 1);
    t.is(m.params.capTable[0].kind, 'senderHosted');
    t.is(m.params.capTable[0].id, 9);
  });

  test('interop reverse: capnp encodes Disembargo with provide context', t => {
    const text = `( disembargo = (
      target = (importedCap = 5),
      context = (provide = 42) ) )`;
    const framed = runCapnpEncode(text);
    const m = decodeMessage(framed);
    t.is(m.type, 'disembargo');
    t.is(m.context.kind, 'provide');
    t.is(m.context.questionId, 42);
    t.is(m.target.kind, 'importedCap');
    t.is(m.target.id, 5);
  });

  test('interop reverse: capnp encodes a Return exception', t => {
    const text = `( return = (
      answerId = 7,
      releaseParamCaps = false,
      exception = ( reason = "boom", type = failed ) ) )`;
    const framed = runCapnpEncode(text);
    const m = decodeMessage(framed);
    t.is(m.type, 'return');
    t.is(m.answerId, 7);
    t.is(m.releaseParamCaps, false);
    t.is(m.result.kind, 'exception');
    t.is(m.result.exception.reason, 'boom');
    t.is(m.result.exception.type, 0);
  });

  test('interop reverse: capnp encodes Release', t => {
    const text = '( release = ( id = 100, referenceCount = 5 ) )';
    const framed = runCapnpEncode(text);
    const m = decodeMessage(framed);
    t.is(m.type, 'release');
    t.is(m.id, 100);
    t.is(m.referenceCount, 5);
  });
}
