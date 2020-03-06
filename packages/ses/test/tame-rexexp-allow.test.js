/* global Compartment */
import test from 'tape';
import { lockdown } from '../src/lockdown-shim.js';

const unsafeRegExp = RegExp;

lockdown({ noTameRegExp: true });

test('lockdown() default - RegExp from Compartment is tamed', t => {
  const c = new Compartment();
  const actualRegExp = c.evaluate('RegExp');

  t.equal(actualRegExp, unsafeRegExp, 'RegExp should be native');

  t.end();
});

test('lockdown() default - RegExp from nested Compartment is tamed', t => {
  const c = new Compartment().evaluate('new Compartment()');
  const actualRegExp = c.evaluate('RegExp');

  t.equal(actualRegExp, unsafeRegExp, 'RegExp should be native');

  t.end();
});
