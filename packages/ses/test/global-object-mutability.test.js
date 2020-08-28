import tap from 'tap';
import sinon from 'sinon';
import { Compartment } from '../src/module-shim.js';
import stubFunctionConstructors from './stub-function-constructors.js';

const { test } = tap;

test('globalObject properties mutable', t => {
  t.plan(4);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  globalThis.Compartment = Compartment;

  const c = new Compartment();

  c.evaluate('Date = function() { return "bogus" }');
  t.equal(c.evaluate('Date()'), 'bogus');

  c.evaluate('Math.embiggen = function(a) { return a+1 }');
  t.equal(c.evaluate('Math.embiggen(1)'), 2);

  c.evaluate('Compartment = function(opts) { this.extra = "extra" }');
  t.equal(c.evaluate('(new Compartment({})).extra'), 'extra');

  c.evaluate('Function = function() { this.extra = "extra" }');
  t.equal(c.evaluate('new Function().extra'), 'extra');

  delete globalThis.Compartment;
  sinon.restore();
});

test('globalObject properties immutable', t => {
  t.plan(6);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const c = new Compartment();

  t.throws(() => c.evaluate('Infinity = 4'), TypeError); // strict mode
  t.equal(c.evaluate('Infinity'), Infinity);

  t.throws(() => c.evaluate('NaN = 4'), TypeError);
  t.notEqual(c.evaluate('NaN'), 4);

  t.throws(() => c.evaluate('undefined = 4'), TypeError);
  t.equal(c.evaluate('undefined'), undefined);

  sinon.restore();
});
