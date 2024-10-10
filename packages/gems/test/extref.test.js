import test from '@endo/ses-ava/prepare-endo.js';
import '@agoric/swingset-liveslots/tools/setup-vat-data.js';
import { E } from '@endo/captp';
import { makeKernelFactory, makeReconnectingCaptpPair } from './util.js';

const { restart, clear } = makeKernelFactory();

test.afterEach(async t => {
  await clear();
});

test.serial('extRefController - reconnecting presence controller', async t => {
  const { kernel } = await restart();
  const makeBob = kernel.vatSupervisor.defineJsClass(
    class Bob {
      ping() {
        return 'pong';
      }
    },
  );
  const bobBootstrap = makeBob();
  const { connect, disconnect } = makeReconnectingCaptpPair({
    kernel,
    bobBootstrap,
  });
  const { aliceCaptp } = connect();
  const bobFacet = await aliceCaptp.getBootstrap();
  t.is(await E(bobFacet).ping(), 'pong');

  disconnect();

  t.is(await E(bobFacet).ping(), 'pong');
});
