import test from 'tape';
import sinon from 'sinon';
import Evaluator from '../../src/evaluator';

// Array is a shared global
test('identity Array', t => {
  t.plan(7);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });

  const e1 = new Evaluator();
  const e2 = new e1.global.Evaluator();

  t.equal(e1.evaluateScript('Array'), Array);
  t.equal(e1.evaluateScript('Array'), e1.evaluateScript('Array'));
  t.equal(e1.evaluateScript('Array'), e2.evaluateScript('Array'));
  t.equal(e1.evaluateScript('Array'), e2.evaluateScript('(0,eval)("Array")'));

  const a2 = e2.evaluateScript('[]');
  t.ok(a2 instanceof Array);
  t.ok(a2 instanceof e1.global.Array);
  t.ok(a2 instanceof e2.global.Array);

  sinon.restore();
});

// Evaluator is a shared global
test('identity Evaluator', t => {
  t.plan(7);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });

  const e1 = new Evaluator();
  const e2 = new e1.global.Evaluator();

  t.equal(e1.evaluateScript('Evaluator'), Evaluator);
  t.equal(e1.evaluateScript('Evaluator'), e1.evaluateScript('Evaluator'));
  t.equal(e1.evaluateScript('Evaluator'), e2.evaluateScript('Evaluator'));
  t.equal(
    e1.evaluateScript('Evaluator'),
    e2.evaluateScript('(0,eval)("Evaluator")'),
  );

  const e3 = e2.evaluateScript('(new Evaluator())');
  t.ok(e3 instanceof Evaluator);
  t.ok(e3 instanceof e1.global.Evaluator);
  t.ok(e3 instanceof e2.global.Evaluator);

  sinon.restore();
});

// eval is evaluator-specific
test('identity eval', t => {
  t.plan(8);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });

  const e1 = new Evaluator();
  const e2 = new e1.global.Evaluator();

  t.ok(e2.evaluateScript('eval') instanceof Function);
  t.ok(e2.evaluateScript('eval') instanceof Object);
  t.ok(e2.evaluateScript('eval instanceof Function'));
  t.ok(e2.evaluateScript('eval instanceof Object'));
  t.ok(e2.evaluateScript('eval') instanceof e1.evaluateScript('Function'));
  t.ok(e2.evaluateScript('eval') instanceof e1.evaluateScript('Object'));

  // eslint-disable-next-line no-eval
  t.notEqual(e2.evaluateScript('eval'), eval);
  t.notEqual(e2.evaluateScript('eval'), e1.evaluateScript('eval'));

  sinon.restore();
});

// Function is evaluator-specific
test('identity Function', t => {
  t.plan(11);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });

  const e1 = new Evaluator();
  const e2 = new e1.global.Evaluator();
  const e3 = new e1.global.Evaluator();

  t.ok(e2.evaluateScript('Function') instanceof Function);
  t.ok(e2.evaluateScript('Function') instanceof Object);
  t.ok(e2.evaluateScript('Function instanceof Function'));
  t.ok(e2.evaluateScript('Function instanceof Object'));
  t.ok(e2.evaluateScript('Function') instanceof e1.evaluateScript('Function'));
  t.ok(e2.evaluateScript('Function') instanceof e1.evaluateScript('Object'));

  t.notEqual(e2.evaluateScript('Function'), Function);
  t.notEqual(e2.evaluateScript('Function'), e1.evaluateScript('Function'));

  const f2 = e2.evaluateScript('function x(a, b) { return a+b; }; x');
  t.ok(f2 instanceof e1.global.Function);
  t.ok(f2 instanceof e2.global.Function);
  t.ok(f2 instanceof e3.global.Function);

  sinon.restore();
});
