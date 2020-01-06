import tap from 'tap';
import sinon from 'sinon';
import Evaluator from '../../src/main.js';
import stubFunctionConstructors from '../stubFunctionConstructors.js';

const { test } = tap;

test('globalObject properties mutabile', t => {
  t.plan(3);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const e = new Evaluator();

  e.evaluate('Date = function() { return "bogus" }');
  t.equal(e.evaluate('Date()'), 'bogus');

  e.evaluate('Math.embiggen = function(a) { return a+1 }');
  t.equal(e.evaluate('Math.embiggen(1)'), 2);

  e.evaluate('Evaluator = function(opts) { this.extra = "extra" }');
  t.equal(e.evaluate('(new Evaluator({})).extra'), 'extra');

  sinon.restore();
});

test('globalObject properties immutable', t => {
  t.plan(6);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const e = new Evaluator();

  t.throws(() => e.evaluate('Infinity = 4'), TypeError); // strict mode
  t.equal(e.evaluate('Infinity'), Infinity);

  t.throws(() => e.evaluate('NaN = 4'), TypeError);
  t.notEqual(e.evaluate('NaN'), 4);

  t.throws(() => e.evaluate('undefined = 4'), TypeError);
  t.equal(e.evaluate('undefined'), undefined);

  sinon.restore();
});
