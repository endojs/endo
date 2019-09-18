import test from 'tape';
import sinon from 'sinon';
import { throwTantrum, assert, cleanupSource } from '../../src/utilities';

/* eslint-disable no-console */

test('throwTantrum', t => {
  t.plan(3);

  sinon.stub(console, 'error').callsFake();

  t.throws(
    () => throwTantrum('foo'),
    /^please report internal shim error: foo$/
  );

  t.equals(console.error.callCount, 1);
  t.equals(
    console.error.getCall(0).args[0],
    'please report internal shim error: foo'
  );

  console.error.restore();
});

test('throwTantrum', t => {
  t.plan(5);

  sinon.stub(console, 'error');

  t.throws(
    () => throwTantrum('foo', new Error('bar')),
    /^please report internal shim error: foo$/
  );

  t.equals(console.error.callCount, 3);
  t.equals(
    console.error.getCall(0).args[0],
    'please report internal shim error: foo'
  );
  t.equals(console.error.getCall(1).args[0], 'Error: bar');
  t.ok(console.error.getCall(2).args[0].match(/\sat (Test|t)\.throws/));

  console.error.restore();
});

test('assert', t => {
  t.plan(4);

  sinon.stub(console, 'error').callsFake();

  t.doesNotThrow(() => assert(true, 'foo'));
  t.throws(
    () => assert(false, 'foo'),
    /^please report internal shim error: foo$/
  );

  t.equals(console.error.callCount, 1);
  t.equals(
    console.error.getCall(0).args[0],
    'please report internal shim error: foo'
  );

  console.error.restore();
});

test('cleanupSource', t => {
  t.plan(3);

  t.equal(
    cleanupSource(`function() { return (0, _123.e)('true'); }`),
    `function() { return (0, eval)('true'); }`
  );
  t.equals(
    cleanupSource(`function() { const { apply } = _123.g.Reflect; }`),
    `function() { const { apply } = Reflect; }`
  );
  t.equal(
    cleanupSource(`function() { cov_2kmyol0g2w[0]++;return true; }`),
    'function() { return true; }'
  );
});
