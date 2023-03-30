/* global globalThis, $262 */

// Use a package self-reference to go through the "exports" resolution
// eslint-disable-next-line import/no-extraneous-dependencies
import '@endo/init/debug.js';
import test from 'ava';
import { createHook } from 'async_hooks';
import { setTimeout } from 'timers';

const gcP = (async () => {
  let gc = globalThis.gc || (typeof $262 !== 'undefined' ? $262.gc : null);
  if (!gc) {
    gc = () => {
      Array.from({ length: 2 ** 24 }, () => Math.random());
    };
  }
  return gc;
})();

test('async_hooks Promise patch', async t => {
  const hasAsyncSymbols =
    Object.getOwnPropertySymbols(Promise.prototype).length > 1;
  let resolve;
  const q = (() => {
    const p1 = new Promise(r => (resolve = r));
    t.deepEqual(
      Reflect.ownKeys(p1),
      [],
      `Promise instances don't start with any own keys`,
    );
    harden(p1);

    // The `.then()` fulfillment triggers the "before" hook for `p2`,
    // which enforces that `p2` is a tracked promise by installing async id symbols
    const p2 = Promise.resolve().then(() => {});
    t.deepEqual(
      Reflect.ownKeys(p2),
      [],
      `Promise instances don't start with any own keys`,
    );
    harden(p2);

    const testHooks = createHook({
      init() {},
      before() {},
      // after() {},
      destroy() {},
    });
    testHooks.enable();

    // Create a promise with symbols attached
    const p3 = Promise.resolve();
    if (!harden.isFake) {
      t.is(Reflect.ownKeys(p3).length > 0, hasAsyncSymbols);
    }

    return Promise.resolve().then(() => {
      resolve(8);
      // ret is a tracked promise created from parent `p1`
      // async_hooks will attempt to get the asyncId from `p1`
      // which was created and frozen before the symbols were installed
      const ret = p1.then(() => {});
      // Trigger attempting to get asyncId of `p1` again, which in current
      // node versions will fail and generate a new one because of an own check
      p1.then(() => {});

      if (!harden.isFake) {
        t.is(Reflect.ownKeys(ret).length > 0, hasAsyncSymbols);
      }

      // testHooks.disable();

      return ret;
    });
  })();

  return q
    .then(() => new Promise(r => setTimeout(r, 0, gcP)))
    .then(gc => gc())
    .then(() => new Promise(r => setTimeout(r)));
});
