// @ts-check

import '@endo/init';
import { makeCapTP } from '@endo/captp';
import { makePipe } from '@endo/stream';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { E } from '@endo/eventual-send';

// Define the valid method invocation patterns of Alice targets.
const AliceShape = M.interface('Alice', {
  ping: M.call().returns(),
});

/** @import { Stream } from '@endo/stream' */

/**
 * This is Alice's program, where she provides a Pinger.
 *
 * @param {Stream} fromBob
 * @param {Stream} toBob
 */
async function makeAlice(fromBob, toBob) {
  const bootstrap = makeExo('Alice', AliceShape, {
    ping() {
      console.log('Ping!');
    },
  });

  // This bit of machinery pumps messages through the pipes above.
  const send = toBob.next.bind(toBob);

  const { dispatch, abort } = makeCapTP('alice', send, bootstrap);
  for await (const message of fromBob) {
    dispatch(message);
  }
}

/**
 * @param {Stream<any, undefined>} fromAlice
 * @param {Stream<undefined, any>} toAlice
 */
async function makeBob(fromAlice, toAlice) {
  // Bob's CapTP message pump.
  const send = toAlice.next.bind(toAlice);

  const { dispatch, getBootstrap, abort } = makeCapTP('alice', send);
  const serve = async () => {
    for await (const message of fromAlice) {
      dispatch(message);
    }
  };

  const doCrimes = async () => {
    // We get the first (and currently only) target exported by Alice.
    const alice = getBootstrap();

    // And we invoke its one method. Ping!
    await E(alice).ping();

    await new Promise(resolve => setTimeout(resolve, 1_000));

    await E(alice).ping();

    await new Promise(resolve => setTimeout(resolve, 1_000));
  };

  await Promise.allSettled([serve(), doCrimes()]);
}

(async () => {
  // Construct a fake duplex connection
  const [fromAlice, toBob] = makePipe();
  const [fromBob, toAlice] = makePipe();

  const alice = makeAlice(fromBob, toBob);
  const bob = makeBob(fromAlice, toAlice);

  // TODO why do the fins never get resolve?
  // TODO why does this function not hang with both serve's waiting?
  await Promise.allSettled([
    alice.then(() => console.log('alice fin')),
    bob.then(() => console.log('bob fin')),
  ]);

  console.log('main fin');
})();
