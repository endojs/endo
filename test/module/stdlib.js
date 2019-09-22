import test from 'tape';
import sinon from 'sinon';
import { getSharedGlobalDescs } from '../../src/stdlib';

test('Global default values', t => {
  const unsafeGlobal = {
    // frozen names
    Infinity,
    NaN,
    undefined,
    // stable names. Should be mutable but frozen in the shim for speed
    JSON: {},
    Math: {},
    // unstable names.
    Date: {},
    Error: {}
  };
  const descs = getSharedGlobalDescs(unsafeGlobal);

  t.equal(Object.keys(descs).length, 7);

  t.equal(descs.Infinity.value, Infinity);
  t.ok(Number.isNaN(descs.NaN.value));
  t.equal(descs.undefined.value, undefined);
  t.equal(descs.JSON.value, unsafeGlobal.JSON);
  t.equal(descs.Math.value, unsafeGlobal.Math);

  for (const name of ['Infinity', 'NaN', 'undefined', 'JSON', 'Math']) {
    const desc = descs[name];
    t.notOk(desc.enumerable, `${name} should not be enumerable`);
    t.notOk(desc.configurable, `${name} should not be configurable`);
    t.notOk(desc.writable, `${name} should not be writable`);
  }

  t.equal(descs.Date.value, unsafeGlobal.Date);
  t.equal(descs.Error.value, unsafeGlobal.Error);

  for (const name of ['Date', 'Error']) {
    const desc = descs[name];
    t.notOk(desc.enumerable, `${name} should not be enumerable`);
    t.ok(desc.configurable, `${name} should be configurable`);
    t.ok(desc.writable, `${name} should be writable`);
  }

  t.end();
});

test('Global accessor throws', t => {
  t.plan(3);

  sinon.stub(console, 'error').callsFake();

  const unsafeGlobal = {};
  Object.defineProperty(unsafeGlobal, 'JSON', {
    get() {
      return Math.random();
    }
  });

  t.throws(
    () => getSharedGlobalDescs(unsafeGlobal),
    /unexpected accessor on global property: JSON/
  );

  // eslint-disable-next-line no-console
  t.equals(console.error.callCount, 1);
  t.equals(
    // eslint-disable-next-line no-console
    console.error.getCall(0).args[0],
    'please report internal shim error: unexpected accessor on global property: JSON'
  );

  // eslint-disable-next-line no-console
  console.error.restore();
});
