/* global Evaluator */
import test from 'tape';
import { lockdown } from '../src/main.js';

lockdown();

test('indirect eval is possible', t => {
  try {
    const s = new Evaluator();
    t.equal(s.evaluate(`(1,eval)('123')`), 123, 'indirect eval succeeds');
  } catch (e) {
    t.assert(false, e);
  } finally {
    t.end();
  }
});

test('SharedArrayBuffer should be removed because it is not on the whitelist', t => {
  const s = new Evaluator();
  // we seem to manage both of these for properties that never existed
  // in the first place
  t.throws(() => s.evaluate('XYZ'), ReferenceError);
  t.equal(s.evaluate('typeof XYZ'), 'undefined');
  const have = typeof SharedArrayBuffer !== 'undefined';
  if (have) {
    // we ideally want both of these, but the realms magic can only
    // manage one at a time (for properties that previously existed but
    // which were removed by the whitelist check)
    // t.throws(() => s.evaluate('SharedArrayBuffer'), ReferenceError);
    t.equal(s.evaluate('typeof SharedArrayBuffer'), 'undefined');
  }
  t.end();
});

test('remove RegExp.prototype.compile', t => {
  const s = new Evaluator();
  t.equal(s.evaluate('const r = /./; typeof r.compile'), 'undefined');
  t.end();
});

test('remove RegExp.$1', t => {
  const s = new Evaluator();
  t.equal(typeof s.evaluate('RegExp.$1'), 'undefined');
  t.end();
});

test('remove Intl', t => {
  const s = new Evaluator();
  // Always removed, not an intrinsic.
  t.equal(s.evaluate('typeof Intl'), 'undefined');
  t.end();
});

test('do not remove Object.prototype.__proto__', t => {
  try {
    const s = new Evaluator();
    t.equal(
      s.evaluate('({}).__proto__'),
      s.global.Object.prototype,
      '({}).__proto__ is accessible',
    );
    t.equal(
      s.evaluate('[].__proto__'),
      s.global.Array.prototype,
      '[].__proto__ is accessible',
    );
    t.equal(
      s.evaluate(`\
function X () {};
X.prototype.__proto__ = Array.prototype;
const x=new X();
x.slice;
`),
      s.global.Array.prototype.slice,
      `prototype __proto__ inheritance works`,
    );
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
