import tap from 'tap';
import sinon from 'sinon';
import { createIntrinsics } from '../../src/intrinsics.js';

const { test } = tap;

test('Intrinsics - values', t => {
  t.plan(6);

  // eslint-disable-next-line no-new-func
  const unsafeGlobal = Function('return this;')();
  const intrinsics = createIntrinsics();

  t.equal(intrinsics.Date, unsafeGlobal.Date);
  t.equal(intrinsics.eval, unsafeGlobal.eval);
  t.equal(intrinsics.Error, unsafeGlobal.Error);
  t.equal(intrinsics.Function, unsafeGlobal.Function);
  t.equal(intrinsics.JSON, unsafeGlobal.JSON);
  t.equal(intrinsics.Math, unsafeGlobal.Math);

  sinon.restore();
});

test('Intrinsics - shims', t => {
  t.plan(2);

  // eslint-disable-next-line no-new-func
  const unsafeGlobal = Function('return this;')();
  const mockDate = sinon.stub(unsafeGlobal, 'Date').callsFake();
  const intrinsics = createIntrinsics();

  t.equal(intrinsics.Date, mockDate); // Ensure shims are picked up
  t.equal(intrinsics.Date, unsafeGlobal.Date);

  sinon.restore();
});

test('Intrinsics - global accessor throws', t => {
  t.plan(3);

  // eslint-disable-next-line no-new-func
  const unsafeGlobal = Function('return this;')();

  sinon.stub(unsafeGlobal.console, 'error').callsFake();
  sinon.stub(unsafeGlobal, 'escape').get(() => Math.random());

  t.throws(
    () => createIntrinsics(),
    /unexpected accessor on global property: escape/,
  );

  t.equals(unsafeGlobal.console.error.callCount, 1);
  t.equals(
    unsafeGlobal.console.error.getCall(0).args[0],
    'please report internal shim error: unexpected accessor on global property: escape',
  );

  sinon.restore();
});
