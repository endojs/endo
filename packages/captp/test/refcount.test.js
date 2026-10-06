// @ts-check

import { Far } from '@endo/marshal';
import test from '@endo/ses-ava/test.js';

import { E, makeCapTP } from '../src/captp.js';
import { detectEngineGC } from './engine-gc.js';
import { makeGcAndFinalize } from './gc-and-finalize.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Connect two CapTPs, A and B, both with gcImports. Messages from A can be
 * held in flight, and every CTP_DROP either side sends is recorded.
 *
 * @param {import('ava').ExecutionContext} t
 * @param {any} bootA
 * @param {any} bootB
 */
const makePair = (t, bootA, bootB) => {
  /** @type {any[]} */
  const held = [];
  let hold = false;
  /** @type {{ A: any[], B: any[] }} */
  const drops = { A: [], B: [] };
  /** @type {Error[]} */
  const rejected = [];
  /** @type {ReturnType<typeof makeCapTP>} */
  let B;
  const A = makeCapTP(
    'A',
    obj => {
      if (obj.type === 'CTP_DROP') drops.A.push(obj);
      if (hold) held.push(obj);
      else B.dispatch(obj);
    },
    bootA,
    { gcImports: true, onReject: e => rejected.push(e) },
  );
  B = makeCapTP(
    'B',
    obj => {
      if (obj.type === 'CTP_DROP') drops.B.push(obj);
      A.dispatch(obj);
    },
    bootB,
    { gcImports: true, onReject: e => rejected.push(e) },
  );
  t.teardown(() => {
    A.abort();
    B.abort();
  });
  // Run thunk while holding back the one message it sends from A to B. The
  // thunk's result is returned unawaited, since it usually cannot settle until
  // the held message is delivered.
  const holdNext = async thunk => {
    await null;
    hold = true;
    const result = thunk();
    for (let i = 0; i < 20 && held.length === 0; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await null;
    }
    hold = false;
    t.is(held.length, 1);
    return { result };
  };
  const releaseHeld = () => B.dispatch(held.shift());
  return { A, B, drops, rejected, holdNext, releaseHeld };
};

test.serial(
  'received question IDs are not counted against our own questions',
  async t => {
    const gcAndFinalize = await makeGcAndFinalize(detectEngineGC());
    const { A, B, drops, rejected } = makePair(
      t,
      Far('bootA', { ping: () => 'A' }),
      Far('bootB', { ping: () => 'B' }),
    );
    const bootAonB = B.getBootstrap(); // B's question q-1
    const bootBonA = A.getBootstrap(); // A's question q-1

    // B asks A three questions: q-2, q-3, q-4 from B's perspective.
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      t.is(await E(bootAonB).ping(), 'A');
    }
    // A asks B one question, q-2 from A's perspective, then lets it go.
    const ask = async () => {
      const answer = await E(bootBonA).ping();
      t.is(answer, 'B');
    };
    await ask();
    await gcAndFinalize();
    await gcAndFinalize();

    const drop = drops.A.find(d => d.slotID === 'q-2');
    t.truthy(drop, 'A dropped its question q-2');
    // Questions carry no reference count. Neither B's own question q-2 nor the
    // answerID of B's reply may be counted against A's question q-2.
    t.is(drop.decRefs, 0);
    t.deepEqual(
      rejected.map(e => e.message),
      [],
    );
  },
);

test.serial(
  'a peer calling our export does not inflate our same-numbered import',
  async t => {
    const gcAndFinalize = await makeGcAndFinalize(detectEngineGC());
    /** @type {any} */
    let taken;
    const objA = Far('objA', { ping: () => 'A' });
    const objB = Far('objB', { ping: () => 'B' });
    const { A, B, drops, rejected, holdNext, releaseHeld } = makePair(
      t,
      Far('bootA', { give: () => objA }),
      Far('bootB', {
        give: () => objB,
        take: o => {
          taken = o;
        },
      }),
    );
    const bootAonB = B.getBootstrap(); // A exports bootA as o+1
    const bootBonA = A.getBootstrap(); // B exports bootB as o+1

    // B borrows objA once (A's export o+2, B's import o-2), then lets it go.
    const borrow = async () => {
      const p = await E(bootAonB).give();
      t.is(await E(p).ping(), 'A');
    };
    await borrow();

    // A obtains objB (B's export o+2) and calls it. Each CTP_CALL carries
    // target 'o-2', which must not be counted against B's import o-2.
    const objBonA = await E(bootBonA).give();
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      t.is(await E(objBonA).ping(), 'B');
    }

    // A sends a second reference to objA, held in flight, while B's presence
    // for objA is collected and B reports the drop.
    const { result: takeP } = await holdNext(() => E(bootBonA).take(objA));
    await gcAndFinalize();
    await gcAndFinalize();
    const drop = drops.B.find(d => d.slotID === 'o-2');
    t.truthy(drop, 'B dropped its import o-2');
    // B saw exactly one reference, so A must keep o+2 for the one in flight.
    t.is(drop.decRefs, 1);

    // Deliver the held message. B's fresh presence for objA must still work.
    releaseHeld();
    await takeP;
    const pingP = E(taken).ping();
    t.is(await Promise.race([pingP, delay(500).then(() => 'unanswered')]), 'A');
    t.deepEqual(
      rejected.map(e => e.message),
      [],
    );
  },
);
