import tap from 'tap';
import sinon from 'sinon';
import Evaluator from '../../src/main.js';
import stubFunctionConstructors from '../stubFunctionConstructors.js';

const { test } = tap;

// Array is a shared global
test('identity Array', t => {
  t.plan(7);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const e1 = new Evaluator();
  const e2 = new e1.global.Evaluator();

  t.equal(e1.evaluate('Array'), Array);
  t.equal(e1.evaluate('Array'), e1.evaluate('Array'));
  t.equal(e1.evaluate('Array'), e2.evaluate('Array'));
  t.equal(e1.evaluate('Array'), e2.evaluate('(0,eval)("Array")'));

  const a2 = e2.evaluate('[]');
  t.ok(a2 instanceof Array);
  t.ok(a2 instanceof e1.global.Array);
  t.ok(a2 instanceof e2.global.Array);

  sinon.restore();
});

// Evaluator is a shared global
test('identity Evaluator', t => {
  t.plan(7);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const e1 = new Evaluator();
  const e2 = new e1.global.Evaluator();

  t.equal(e1.evaluate('Evaluator'), Evaluator);
  t.equal(e1.evaluate('Evaluator'), e1.evaluate('Evaluator'));
  t.equal(e1.evaluate('Evaluator'), e2.evaluate('Evaluator'));
  t.equal(e1.evaluate('Evaluator'), e2.evaluate('(0,eval)("Evaluator")'));

  const e3 = e2.evaluate('(new Evaluator())');
  t.ok(e3 instanceof Evaluator);
  t.ok(e3 instanceof e1.global.Evaluator);
  t.ok(e3 instanceof e2.global.Evaluator);

  sinon.restore();
});

// eval is evaluator-specific
test('identity eval', t => {
  t.plan(8);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const e1 = new Evaluator();
  const e2 = new e1.global.Evaluator();

  t.ok(e2.evaluate('eval') instanceof Function);
  t.ok(e2.evaluate('eval') instanceof Object);
  t.ok(e2.evaluate('eval instanceof Function'));
  t.ok(e2.evaluate('eval instanceof Object'));
  t.ok(e2.evaluate('eval') instanceof e1.evaluate('Function'));
  t.ok(e2.evaluate('eval') instanceof e1.evaluate('Object'));

  // eslint-disable-next-line no-eval
  t.notEqual(e2.evaluate('eval'), eval);
  t.notEqual(e2.evaluate('eval'), e1.evaluate('eval'));

  sinon.restore();
});

// Function is evaluator-specific
test('identity Function', t => {
  t.plan(11);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const e1 = new Evaluator();
  const e2 = new e1.global.Evaluator();
  const e3 = new e1.global.Evaluator();

  t.ok(e2.evaluate('Function') instanceof Function);
  t.ok(e2.evaluate('Function') instanceof Object);
  t.ok(e2.evaluate('Function instanceof Function'));
  t.ok(e2.evaluate('Function instanceof Object'));
  t.ok(e2.evaluate('Function') instanceof e1.evaluate('Function'));
  t.ok(e2.evaluate('Function') instanceof e1.evaluate('Object'));

  t.notEqual(e2.evaluate('Function'), Function);
  t.notEqual(e2.evaluate('Function'), e1.evaluate('Function'));

  const f2 = e2.evaluate('function x(a, b) { return a+b; }; x');
  t.ok(f2 instanceof e1.global.Function);
  t.ok(f2 instanceof e2.global.Function);
  t.ok(f2 instanceof e3.global.Function);

  sinon.restore();
});
