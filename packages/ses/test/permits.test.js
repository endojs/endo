import test from 'ava';
import '../index.js';

lockdown();

test('indirect eval is possible', t => {
  const c = new Compartment();
  t.is(c.evaluate("(1,eval)('123')"), 123, 'indirect eval succeeds');
});

test('SharedArrayBuffer should be removed because it is not permitted', t => {
  const c = new Compartment();
  t.is(c.evaluate('typeof SharedArrayBuffer'), 'undefined');
  t.is(c.evaluate('SharedArrayBuffer'), undefined);
});

test('remove RegExp.prototype.compile', t => {
  const c = new Compartment();
  t.is(
    c.evaluate('const r = /./; typeof r.compile'),
    'undefined',
    'should remove RegExp.prototype.compile',
  );
});

test('remove RegExp.$1', t => {
  const c = new Compartment();
  t.is(typeof c.evaluate('RegExp.$1'), 'undefined', 'should remove RegExp.$1');
});

test('remove Intl', t => {
  const c = new Compartment();
  // Always removed, not an intrinsic.
  t.is(c.evaluate('typeof Intl'), 'undefined');
});

test('do not remove Object.prototype.__proto__', t => {
  const c = new Compartment();
  t.is(
    c.evaluate('({}).__proto__'),
    c.globalThis.Object.prototype,
    '({}).__proto__ is accessible',
  );
  t.is(
    c.evaluate('[].__proto__'),
    c.globalThis.Array.prototype,
    '[].__proto__ is accessible',
  );
  t.is(
    c.evaluate(`\
function X () {};
X.prototype.__proto__ = Array.prototype;
const x=new X();
x.slice;
`),
    c.globalThis.Array.prototype.slice,
    'prototype __proto__ inheritance works',
  );
});

test('Function constructor should be inert', t => {
  t.throws(
    () => Function.prototype.constructor(),
    {
      message: 'Function.prototype.constructor is not a valid constructor.',
    },
    'Function constructor should be disabled',
  );
});

test('Compartment constructor should be inert', t => {
  t.throws(
    () => Compartment.prototype.constructor(),
    {
      message: 'Compartment.prototype.constructor is not a valid constructor.',
    },
    'Compartment constructor should be disabled',
  );
});
