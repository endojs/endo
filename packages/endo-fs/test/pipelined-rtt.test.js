// @ts-nocheck
/* eslint-disable import/order, no-await-in-loop */

/**
 * Pipelined-walk proof over a real CapTP connection
 * (F9, DESIGN.md §3 #2).
 *
 * The design promises that a chain like
 *   E(root).lookup(a).lookup(b).lookup(c).lookup(d).getQid()
 * fans out as a single batch of CapTP messages — every
 * `CTP_CALL` reaches the wire before any `CTP_RETURN` comes
 * back, rather than the depth-plus-one sequential round trips
 * a naive client would issue.
 *
 * These tests host an `@endo/endo-fs` `Filesystem` on a
 * "right" vat, drive it from a "left" vat through `makeCapTP`,
 * and wrap each side's `send` function so every wire message
 * lands in a shared transcript array (`_captp-pair.js`).
 * Snapshot fixtures pin the interleaved send/receive order;
 * assertions on the transcript verify the pipelining property
 * directly rather than via in-process method-call counting.
 */

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/far';

import { makeInMemoryFilesystem } from '../src/in-memory.js';
import { makeConnectedPair, settle } from './_captp-pair.js';

const populate = async () => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const a = await E(root).mkdir('a', {});
  const b = await E(a).mkdir('b', {});
  const c = await E(b).mkdir('c', {});
  await E(c).mkdir('d', {});
  return fs;
};

test('pipelined chain over CapTP: all CTP_CALL messages reach the wire before any CTP_RETURN', async t => {
  const fs = await populate();
  const { bootstrapRef, transcript } = makeConnectedPair(fs);
  // Drain the bootstrap exchange so the snapshot below covers
  // only the chain we issue.
  await E(bootstrapRef).root();
  const bootstrapEnd = transcript.length;

  // Build the chain WITHOUT awaiting intermediates. Cross-vat
  // delivery is deferred via queueMicrotask, so the right vat
  // can't reply until the left vat has finished issuing the
  // whole chain.
  const rootP = E(bootstrapRef).root();
  const aP = E(rootP).lookup('a');
  const bP = E(aP).lookup('b');
  const cP = E(bP).lookup('c');
  const tailP = E(cP).lookup('d');
  const qid = await E(tailP).getQid();
  t.is(qid.type, 'directory');
  await settle();

  // Pipelining signature: every left→right CTP_CALL that the
  // chain issues appears in the transcript before any
  // right→left reply to those calls. Equivalently: the wire
  // shows N consecutive CALLs followed by N RETURNs, not an
  // interleaved CALL/RETURN/CALL/RETURN sequence.
  const chainEntries = transcript.slice(bootstrapEnd);
  const firstReturnAt = chainEntries.findIndex(e => e.type === 'CTP_RETURN');
  const callsBeforeFirstReturn = chainEntries
    .slice(0, firstReturnAt)
    .filter(e => e.type === 'CTP_CALL');
  t.is(
    callsBeforeFirstReturn.length,
    6,
    'all six chain CTP_CALLs (root + 4 lookups + getQid) reach the wire before the first CTP_RETURN',
  );
  t.deepEqual(
    callsBeforeFirstReturn.map(e => e.method),
    ['root', 'lookup', 'lookup', 'lookup', 'lookup', 'getQid'],
  );

  t.snapshot(transcript, 'pipelined chain wire transcript');
});

test('non-pipelined sequential walk over CapTP: every CTP_CALL is followed by its CTP_RETURN before the next call', async t => {
  const fs = await populate();
  const { bootstrapRef, transcript } = makeConnectedPair(fs);
  await E(bootstrapRef).root(); // drain bootstrap exchange
  const bootstrapEnd = transcript.length;

  const root = await E(bootstrapRef).root();
  const a = await E(root).lookup('a');
  const b = await E(a).lookup('b');
  const c = await E(b).lookup('c');
  const d = await E(c).lookup('d');
  const qid = await E(d).getQid();
  t.is(qid.type, 'directory');
  await settle();

  // Filter to the CALL/RETURN frames the user issued. For a
  // sequential walk the pattern is CALL, RETURN, CALL, RETURN,
  // … — each step awaits its reply before issuing the next.
  const callsAndReturns = transcript
    .slice(bootstrapEnd)
    .filter(e => e.type === 'CTP_CALL' || e.type === 'CTP_RETURN');
  for (let i = 0; i + 1 < callsAndReturns.length; i += 2) {
    t.is(callsAndReturns[i].type, 'CTP_CALL', `entry ${i} is a CALL`);
    t.is(
      callsAndReturns[i + 1].type,
      'CTP_RETURN',
      `entry ${i + 1} is a RETURN`,
    );
  }

  t.snapshot(transcript, 'sequential walk wire transcript');
});

test('lookup of a missing intermediate short-circuits the chain over CapTP', async t => {
  const fs = await populate();
  const { bootstrapRef, transcript } = makeConnectedPair(fs);
  await E(bootstrapRef).root(); // drain bootstrap
  const bootstrapEnd = transcript.length;

  const err = await t.throwsAsync(async () => {
    const rootP = E(bootstrapRef).root();
    const aP = E(rootP).lookup('a');
    const zzzP = E(aP).lookup('zzz');
    const cP = E(zzzP).lookup('c');
    const tailP = E(cP).lookup('d');
    await E(tailP).getQid();
  });
  t.regex(err.message, /ENOENT/);
  await settle();

  // The chain was still pipelined — every call reached the wire
  // before any reply. The rejection propagates through the
  // pipeline so the later calls' return values are themselves
  // rejections, but the messages did go out.
  const issuedCalls = transcript
    .slice(bootstrapEnd)
    .filter(e => e.from === 'left' && e.type === 'CTP_CALL');
  t.is(issuedCalls.length, 6, 'all chain calls went out despite the failure');

  t.snapshot(transcript, 'rejected chain wire transcript');
});
