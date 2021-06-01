import { assert, details as X } from '@agoric/assert';
import { Far } from '@agoric/marshal';
import { E, makeCapTP } from '../lib/captp';

export function createHostBootstrap(exportAsSyncable) {
  // Create a remotable that has a syncable return value.
  return Far('test sync', {
    getSyncable(n) {
      const syncable = exportAsSyncable(
        Far('getN', {
          getN() {
            return n;
          },
        }),
      );
      return syncable;
    },
  });
}

export async function runSyncTests(t, Sync, bs) {
  // Demonstrate async compatibility of syncable.
  const pn = E(E(bs).getSyncable(3)).getN();
  t.is(Promise.resolve(pn), pn);
  t.is(await pn, 3);

  // Demonstrate Sync cannot be used on a promise.
  const ps = E(bs).getSyncable(4);
  t.throws(() => Sync(ps).getN(), {
    instanceOf: Error,
    message: /target cannot be a promise/,
  });

  // Demonstrate Sync used on a remotable.
  const s = await ps;
  t.is(Sync(s).getN(), 4);

  // Demonstrate Sync fails on an unmarked remotable.
  const b = await bs;
  t.throws(() => Sync(b).getSyncable(5), {
    instanceOf: Error,
    message: /imported target was not exportAsSyncable/,
  });
}

function createGuestBootstrap(Sync, other) {
  return Far('tests', {
    async runSyncTests() {
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
      await runSyncTests(mockT, Sync, other);
      return true;
    },
  });
}

const SEM_WAITING = 0;
const SEM_READY = 2;
const SEM_REJECT = 1;

function makeBufs(sab) {
  const sembuf = new Int32Array(sab, 0, 2 * Int32Array.BYTES_PER_ELEMENT);
  const databuf = new Uint8Array(sab, sembuf.byteLength);
  return { sembuf, databuf };
}

export function makeHost(send, sab) {
  const { sembuf, databuf } = makeBufs(sab);
  const te = new TextEncoder('utf-8');
  const { dispatch, getBootstrap, exportAsSyncable } = makeCapTP(
    'host',
    send,
    () => createHostBootstrap(exportAsSyncable),
    {
      // eslint-disable-next-line require-yield
      async *giveSyncReply(isReject, ser) {
        // We need a bufferable message.
        const data = JSON.stringify(ser);
        const { written } = te.encodeInto(data, databuf);
        sembuf[1] = written;
        sembuf[0] = SEM_READY + (isReject ? SEM_REJECT : 0);
        Atomics.notify(sembuf, 0, +Infinity);
      },
    },
  );

  return { dispatch, getBootstrap };
}

export function makeGuest(send, sab) {
  const { sembuf, databuf } = makeBufs(sab);
  const td = new TextDecoder('utf-8');
  const { dispatch, getBootstrap, Sync } = makeCapTP(
    'guest',
    send,
    () => createGuestBootstrap(Sync, getBootstrap()),
    {
      *takeSyncReply() {
        // Initialize the reply.
        sembuf[0] = SEM_WAITING;
        yield;

        // Wait for the reply to return.
        Atomics.wait(sembuf, 0, SEM_WAITING);

        // eslint-disable-next-line no-bitwise
        const isReject = !!(sembuf[0] & 1);
        const data = td.decode(databuf.slice(0, sembuf[1]));
        const ser = JSON.parse(data);
        return [isReject, ser];
      },
    },
  );
  return { dispatch, getBootstrap, Sync };
}
