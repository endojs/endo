/* global setTimeout */

import { Far } from '@endo/marshal';
import { X, Fail } from '@endo/errors';
import { E, makeCapTP } from '../src/captp.js';

import { makeAtomicsTrapGuest, makeAtomicsTrapHost } from '../src/atomics.js';

export const createHostBootstrap = makeTrapHandler => {
  // Create a remotable that has a syncable return value.
  return Far('test traps', {
    getTraps(n) {
      return makeTrapHandler('getNTraps', {
        getN(i = 0) {
          return i + n;
        },
        echo(h) {
          return h;
        },
        getPromise() {
          return new Promise(resolve => setTimeout(() => resolve(n), 10));
        },
      });
    },
  });
};

export const runTrapTests = async (t, Trap, bs, unwrapsPromises) => {
  const trapsOffset = 3;

  await null;
  // Demonstrate async compatibility of traps.
  const pn = E(E(bs).getTraps(trapsOffset)).getN();
  t.is(Promise.resolve(pn), pn);
  t.is(await pn, trapsOffset);

  // Demonstrate Trap cannot be used on a promise.
  const trapsOffset2 = 4;
  const ps = E(bs).getTraps(trapsOffset2);
  t.throws(() => Trap(ps).getN(), {
    instanceOf: Error,
    message: /target cannot be a promise/,
  });

  // Demonstrate Trap used on a remotable.
  const s = await ps;
  for (let i = 0; i < 1000; i += 1) {
    t.is(Trap(s).getN(i), i + trapsOffset2, `getN #${i}`);
    t.is(
      Trap(s).echo(`hello my 💩 friend ${i}`),
      `hello my 💩 friend ${i}`,
      `echo #${i}`,
    );
  }

  // Try Trap unwrapping of a promise.
  if (unwrapsPromises) {
    t.is(Trap(s).getPromise(), 4);
  } else {
    // If it's not supported, verify that an exception is thrown.
    t.throws(() => Trap(s).getPromise(), {
      instanceOf: Error,
      message: /reply cannot be a Thenable/,
    });
  }

  // Demonstrate Trap fails on an unmarked remotable.
  const b = await bs;
  t.throws(() => Trap(b).getTraps(5), {
    instanceOf: Error,
    message: /imported target was not created with makeTrapHandler/,
  });
};

const createGuestBootstrap = (Trap, other) => {
  return Far('tests', {
    async runTrapTests(unwrapsPromises) {
      const mockT = {
        is(a, b) {
          assert.equal(a, b, X`${a} !== ${b}`);
        },
        throws(thunk, _spec) {
          let ret;
          try {
            ret = thunk();
          } catch (e) {
            return;
          }
          Fail`Thunk did not throw: ${ret}`;
        },
      };
      await runTrapTests(mockT, Trap, other, unwrapsPromises);
      return true;
    },
  });
};

export const makeHost = (send, sab) => {
  const { dispatch, getBootstrap, makeTrapHandler } = makeCapTP(
    'host',
    send,
    () => createHostBootstrap(makeTrapHandler),
    {
      trapHost: makeAtomicsTrapHost(sab),
    },
  );

  return { dispatch, getBootstrap };
};

export const makeGuest = (send, sab) => {
  const { dispatch, getBootstrap, Trap } = makeCapTP(
    'guest',
    send,
    () => createGuestBootstrap(Trap, getBootstrap()),
    {
      trapGuest: makeAtomicsTrapGuest(sab),
    },
  );
  return { dispatch, getBootstrap, Trap };
};
