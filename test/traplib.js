// @ts-check
/* global setTimeout */

import { assert, details as X } from '@agoric/assert';
import { Far } from '@agoric/marshal';
import { E, makeCapTP } from '../src/captp';

export const createHostBootstrap = makeTrapHandler => {
  // Create a remotable that has a syncable return value.
  return Far('test traps', {
    getTraps(n) {
      return makeTrapHandler('getNTraps', {
        getN() {
          return n;
        },
        getPromise() {
          return new Promise(resolve => setTimeout(() => resolve(n), 10));
        },
      });
    },
  });
};

export const runTrapTests = async (t, Trap, bs, unwrapsPromises) => {
  // Demonstrate async compatibility of traps.
  const pn = E(E(bs).getTraps(3)).getN();
  t.is(Promise.resolve(pn), pn);
  t.is(await pn, 3);

  // Demonstrate Trap cannot be used on a promise.
  const ps = E(bs).getTraps(4);
  t.throws(() => Trap(ps).getN(), {
    instanceOf: Error,
    message: /target cannot be a promise/,
  });

  // Demonstrate Trap used on a remotable.
  const s = await ps;
  t.is(Trap(s).getN(), 4);

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
          assert.fail(X`Thunk did not throw: ${ret}`);
        },
      };
      await runTrapTests(mockT, Trap, other, unwrapsPromises);
      return true;
    },
  });
};

const SEM_REJECT = 1;
const SEM_READY = 2;
const SEM_AGAIN = 4;
const SEM_WAITING = 8;

const makeBufs = sab => {
  const sembuf = new Int32Array(sab, 0, 2);
  const databuf = new Uint8Array(sab, sembuf.byteLength);
  return { sembuf, databuf };
};

export const makeHost = (send, sab) => {
  const { sembuf, databuf } = makeBufs(sab);
  const te = new TextEncoder();
  const { dispatch, getBootstrap, makeTrapHandler } = makeCapTP(
    'host',
    send,
    () => createHostBootstrap(makeTrapHandler),
    {
      trapHost: ([isReject, ser]) => {
        // We need a bufferable message.
        const json = JSON.stringify(ser);
        const encoded = te.encode(json);
        let i = 0;

        // Send chunks in the data transfer buffer.
        const sendChunk = () => {
          const subenc = encoded.subarray(i, i + databuf.length);
          databuf.set(subenc);
          sembuf[1] = encoded.length - i;
          i += subenc.length;
          const done = i >= encoded.length;
          sembuf[0] =
            // eslint-disable-next-line no-bitwise
            (done ? SEM_READY : SEM_AGAIN) | (isReject ? SEM_REJECT : 0);
          Atomics.notify(sembuf, 0, +Infinity);

          if (done) {
            // All done!
            return undefined;
          }

          return sendChunk;
        };
        return sendChunk();
      },
    },
  );

  return { dispatch, getBootstrap };
};

export const makeGuest = (send, sab) => {
  const { sembuf, databuf } = makeBufs(sab);
  const { dispatch, getBootstrap, Trap } = makeCapTP(
    'guest',
    send,
    () => createGuestBootstrap(Trap, getBootstrap()),
    {
      trapGuest: ({ takeMore }) => {
        const td = new TextDecoder('utf-8');

        // Initialize the reply.
        const next = () => {
          sembuf[0] = SEM_WAITING;
          takeMore();
          // Wait for the reply to return.
          Atomics.wait(sembuf, 0, SEM_WAITING);
        };

        next();

        let json = '';
        // eslint-disable-next-line no-bitwise
        while (sembuf[0] & SEM_AGAIN) {
          json += td.decode(databuf.subarray(0, sembuf[1]), { stream: true });
          next();
        }

        json += td.decode(databuf.subarray(0, sembuf[1]));

        // eslint-disable-next-line no-bitwise
        const isReject = !!(sembuf[0] & SEM_REJECT);

        const ser = JSON.parse(json);
        return [isReject, ser];
      },
    },
  );
  return { dispatch, getBootstrap, Trap };
};
