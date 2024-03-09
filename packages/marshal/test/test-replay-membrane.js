import test from '@endo/ses-ava/prepare-endo.js';

// eslint-disable-next-line import/order
import { Far } from '@endo/pass-style';
import { makeHostLogMembraneKit } from '../src/host-log-membrane.js';
import { makeReplayMembraneKit } from '../src/replay-membrane.js';
import { equalEnough } from '../src/equalEnough.js';

test('test replay-membrane basics', async t => {
  /** @type {any} */
  let guestState;
  const guestAsyncFuncR = Far(
    'guestSetState',
    async (newGuestState, guestOrchestraW) => {
      guestState = newGuestState;
      const guestPauseWP = guestOrchestraW.getHostPauseP();
      await guestPauseWP;
      return Far('guestStateGetterR', {
        getGuestState() {
          return guestState;
        },
      });
    },
  );
  const hostLog = [];
  const { hostProxy: hostAsyncFuncW, revoke } = makeHostLogMembraneKit(
    guestAsyncFuncR,
    hostLog,
  );
  t.not(guestAsyncFuncR, hostAsyncFuncW);
  const host88 = [88];
  const host99 = [99];
  const hostPauseRP = Promise.resolve('wait for it');
  const hostOrchestraR = Far('hostOrchestra', {
    getHostPauseP() {
      return hostPauseRP;
    },
  });
  const hostStateGetterWP = hostAsyncFuncW(host88, hostOrchestraR);
  assert(guestState);
  t.is(guestState[0], 88);
  t.not(guestState, host88);
  const hostStateGetterW = await hostStateGetterWP;
  // eslint-disable-next-line no-underscore-dangle
  const methodNames = hostStateGetterW.__getMethodNames__();
  const hostState = hostStateGetterW.getGuestState();
  t.is(hostState[0], 88);
  revoke('Halt!');
  t.throws(() => hostAsyncFuncW(host99), {
    message: /Revoked: Halt!/,
  });
  t.throws(() => hostStateGetterW.getGuestState(), {
    message: /Revoked: Halt!/,
  });

  t.is(guestState[0], 88);
  t.deepEqual(methodNames, ['__getMethodNames__', 'getGuestState']);

  const golden1 = harden([
    ['doCall', hostAsyncFuncW, undefined, [[88], hostOrchestraR], 0],
    ['checkCall', hostOrchestraR, 'getHostPauseP', [], 1],
    ['doReturn', 1, hostPauseRP],
    ['checkReturn', 0, hostStateGetterWP],
    ['doFulfill', hostPauseRP, 'wait for it'],
    ['checkFulfill', hostStateGetterWP, hostStateGetterW],
    ['doCall', hostStateGetterW, '__getMethodNames__', [], 6],
    ['checkReturn', 6, ['__getMethodNames__', 'getGuestState']],
    ['doCall', hostStateGetterW, 'getGuestState', [], 8],
    ['checkReturn', 8, [88]],
  ]);
  const golden2 = harden([
    ['doCall', hostAsyncFuncW, undefined, [[88], hostOrchestraR], 0],
    ['checkCall', hostOrchestraR, 'getHostPauseP', [], 1],
    ['doReturn', 1, hostPauseRP],
    ['checkReturn', 0, hostStateGetterWP],
    ['doFulfill', hostPauseRP, 'wait for it'],
    // ['checkFulfill', hostStateGetterWP, hostStateGetterW],
    // ['doCall', hostStateGetterW, '__getMethodNames__', [], 6],
    // ['checkReturn', 6, ['__getMethodNames__', 'getGuestState']],
    // ['doCall', hostStateGetterW, 'getGuestState', [], 8],
    // ['checkReturn', 8, [88]],
  ]);
  t.deepEqual(hostLog, golden1);
  t.true(equalEnough(hostLog, golden1));

  const { hostProxy: _hostSetState2 } = await makeReplayMembraneKit(
    guestAsyncFuncR,
    [...golden2],
  );
});
