// Note that we do not
//   import '../index.js';
//   import './lockdown-safe.js';
// so that this test is only testing the raw unmodified JS behavior, not
// the SES shim behavior.

// This test is currently written only to demonstrate the behavior we're
// seeing on v8. The text of the error messages in particular are
// engine specific. Since these tests demonstrate violation of the
// fundamental object invariants, there's definitely a bug somewhere.
// But we don't yet know if the bug's origin is v8 or an inconsistency
// in the EcmaScript spec itself.

// eslint-disable-next-line import/no-extraneous-dependencies
import test from 'ava';

import * as nsConst1 from './module-namespace-const-1.js';
import * as nsLet2 from './module-namespace-let-2.js';
import * as nsConst34 from './module-namespace-const-3-4.js';
import * as nsLive56 from './module-namespace-live-5-6.js';
import * as nsLive78 from './module-namespace-live-7-8.js';

const { freeze, isFrozen, isExtensible, getOwnPropertyDescriptors } = Object;

test('freeze module-namespace-const-1', t => {
  t.is(isFrozen(nsConst1), false, 'not pre-frozen');
  t.is(isExtensible(nsConst1), false, 'is pre non-extensible');
  const descs1 = getOwnPropertyDescriptors(nsConst1);
  t.is(descs1.one.writable, true, 'const one is unfortunately writable');
  t.is(descs1.one.configurable, false, 'at least it is not configurable');

  // Surprising that the `freeze` both works and throws. Surprising that the
  // error seems to indicate that it did not freeze the property that it
  // actually did freeze. Worse, the text of the error looks like an
  // "override mistake" problem, which is actually completely irrelevant.
  // The error message refers to "assign" but no assignment is happening.

  t.throws(() => freeze(nsConst1), {
    message:
      /Cannot assign to read only property 'one' of object '\[object Module\]'/,
  });
  t.is(isFrozen(nsConst1), true, 'now it is frozen');
  const descs2 = getOwnPropertyDescriptors(nsConst1);
  t.is(descs2.one.writable, false, 'const one no longer writable');
  // console.log(JSON.stringify(descs2));
});

test('freeze module-namespace-let-2', t => {
  t.is(isFrozen(nsLet2), false, 'not pre-frozen');
  t.is(isExtensible(nsLet2), false, 'is pre non-extensible');
  const descs1 = getOwnPropertyDescriptors(nsLet2);
  t.is(descs1.two.writable, true, 'let two is unfortunately writable');
  t.is(descs1.two.configurable, false, 'at least it is not configurable');

  // Surprising that a `let` variable's export property can be made non-writable

  t.throws(() => freeze(nsLet2), {
    message:
      /Cannot assign to read only property 'two' of object '\[object Module\]'/,
  });
  t.is(isFrozen(nsLet2), true, 'now it is frozen');
  const descs2 = getOwnPropertyDescriptors(nsLet2);
  t.is(descs2.two.writable, false, 'let two no longer writable');
  // console.log(JSON.stringify(descs2));
});

test('freeze module-namespace-const-3-4', t => {
  t.is(isFrozen(nsConst34), false, 'not pre-frozen');
  t.is(isExtensible(nsConst34), false, 'is pre non-extensible');
  const descs1 = getOwnPropertyDescriptors(nsConst34);
  t.is(descs1.three.writable, true, 'const three is writable');
  t.is(descs1.four.writable, true, 'const four is writable');

  // Surprising that each freeze actually freezes only one property and then
  // fails.

  t.throws(() => freeze(nsConst34), {
    message:
      /Cannot assign to read only property 'four' of object '\[object Module\]'/,
  });
  t.is(isFrozen(nsConst34), false, 'still not frozen');
  const descs2 = getOwnPropertyDescriptors(nsConst34);
  t.is(descs2.four.writable, false, 'const four no longer writable');
  t.is(descs2.three.writable, true, 'const three still writable');
  // console.log(JSON.stringify(descs2));

  t.throws(() => freeze(nsConst34), {
    message:
      /Cannot assign to read only property 'three' of object '\[object Module\]'/,
  });
  t.is(isFrozen(nsConst34), true, 'now it is frozen');
  const descs3 = getOwnPropertyDescriptors(nsConst34);
  t.is(descs3.four.writable, false, 'const four no longer writable');
  t.is(descs3.three.writable, false, 'const three no longer writable');
  // console.log(JSON.stringify(descs3));
});

test('freeze module-namespace-live-5-6', t => {
  t.is(isFrozen(nsLive56), false, 'not pre-frozen');
  t.is(isExtensible(nsLive56), false, 'is pre non-extensible');
  const descs1 = getOwnPropertyDescriptors(nsLive56);
  t.is(descs1.writeFive.writable, true, 'const writeFive is writable');
  t.is(descs1.five.writable, true, 'let five is writable');

  // Slightly surpring that `four` was frozen before `three` above but
  // `writeFive` (which is textually second, like `four` was) is frozen
  // after `five`. But the bug surprise is explained below.

  t.throws(() => freeze(nsLive56), {
    message:
      /Cannot assign to read only property 'five' of object '\[object Module\]'/,
  });
  t.is(isFrozen(nsLive56), false, 'still not frozen');
  const descs2 = getOwnPropertyDescriptors(nsLive56);
  t.is(descs2.five.writable, false, 'let five no longer writable');
  t.is(descs2.writeFive.writable, true, 'const writeFive still writable');
  // console.log(JSON.stringify(descs2));

  t.throws(() => freeze(nsLive56), {
    message:
      /Cannot assign to read only property 'writeFive' of object '\[object Module\]'/,
  });
  t.is(isFrozen(nsLive56), true, 'now it is frozen');
  const descs3 = getOwnPropertyDescriptors(nsLive56);
  t.is(descs3.five.writable, false, 'let five no longer writable');
  t.is(descs3.writeFive.writable, false, 'const writeFive no longer writable');
  // console.log(JSON.stringify(descs3));

  t.is(typeof nsLive56.writeFive, 'function');
  nsLive56.writeFive();

  const descs4 = getOwnPropertyDescriptors(nsLive56);

  // OMG Surprising that a fundamental object invariant was violated!
  // The `nsLive.five` property was observed to be a
  // non-writable non-configurable data property with value 5.
  // This same property was then observed to be a
  // non-writable non-configurable data property with value 6.

  t.deepEqual(descs3.five, {
    value: 5,
    writable: false,
    enumerable: true,
    configurable: false,
  });
  t.deepEqual(descs4.five, {
    value: 6,
    writable: false,
    enumerable: true,
    configurable: false,
  });
  // console.log(JSON.stringify(descs4));
});

test('freeze module-namespace-live-7-8', t => {
  // Surprise: one violation enables unbounded derived violations!

  // The proxy enforcement mechanism of the fundamental invariants relies
  // on the inability of a proxy's target to violate these invariants. However,
  // because module namespace objects violate these invariants, they can be used
  // to construct proxies that also violate these invariants.

  // Aside from the proxy, live-7-8 is like live-5-6 so we elide all the
  // tests that would simply be redundant with those above.

  const proxy78 = new Proxy(nsLive78, {});

  t.throws(() => freeze(nsLive78), {
    message:
      /Cannot assign to read only property 'seven' of object '\[object Module\]'/,
  });
  t.throws(() => freeze(nsLive78), {
    message:
      /Cannot assign to read only property 'writeSeven' of object '\[object Module\]'/,
  });
  const proxyDescs1 = getOwnPropertyDescriptors(proxy78);

  t.is(typeof nsLive78.writeSeven, 'function');
  nsLive78.writeSeven();

  const proxyDescs2 = getOwnPropertyDescriptors(proxy78);

  t.deepEqual(proxyDescs1.seven, {
    value: 7,
    writable: false,
    enumerable: true,
    configurable: false,
  });
  t.deepEqual(proxyDescs2.seven, {
    value: 8,
    writable: false,
    enumerable: true,
    configurable: false,
  });
  // console.log(JSON.stringify(descs4));
});
