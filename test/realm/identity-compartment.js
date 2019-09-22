import test from 'tape';
import Evaluator from '../../src/evaluator';

// JSON is a shared global
test('identity JSON', t => {
  t.plan(4);

  const r1 = new Evaluator();
  const r2 = new r1.global.Evaluator();

  t.equal(r2.evaluate('JSON'), r2.evaluate('JSON'));
  t.equal(r2.evaluate('JSON'), r2.evaluate('(1,eval)("JSON")'));
  t.equal(r2.evaluate('JSON'), JSON);
  t.equal(r2.evaluate('JSON'), r1.evaluate('JSON'));
});

// Evaluator is a shared global
test('identity Evaluator', t => {
  t.plan(8);

  const r1 = new Evaluator();
  const r2 = new r1.global.Evaluator();

  t.ok(r2.evaluate('Evaluator instanceof Function'));
  t.ok(r2.evaluate('Evaluator instanceof Object'));
  t.ok(r2.evaluate('Evaluator') instanceof r1.evaluate('Function'));
  t.ok(r2.evaluate('Evaluator') instanceof r1.evaluate('Object'));
  t.ok(r2.evaluate('Evaluator') instanceof Function);
  t.ok(r2.evaluate('Evaluator') instanceof Object);
  t.equal(r2.evaluate('Evaluator'), r1.evaluate('Evaluator'));
  t.equal(r2.evaluate('Evaluator'), Evaluator);
});

// eval is realm-specific
test('identity eval', t => {
  t.plan(8);

  const r1 = new Evaluator();
  const r2 = new r1.global.Evaluator();

  t.ok(r2.evaluate('eval instanceof Function'));
  t.ok(r2.evaluate('eval instanceof Object'));
  t.ok(r2.evaluate('eval') instanceof r1.evaluate('Function'));
  t.ok(r2.evaluate('eval') instanceof r1.evaluate('Object'));
  t.ok(r2.evaluate('eval') instanceof Function);
  t.ok(r2.evaluate('eval') instanceof Object);
  t.notEqual(r2.evaluate('eval'), r1.evaluate('eval'));
  t.notEqual(r2.evaluate('eval'), eval);
});

// Function is realm-specific
test('identity Function', t => {
  t.plan(11);

  const r1 = new Evaluator();
  const r2 = new r1.global.Evaluator();
  const r3 = new r1.global.Evaluator();

  t.ok(r2.evaluate('Function instanceof Function'));
  t.ok(r2.evaluate('Function instanceof Object'));
  t.ok(r2.evaluate('Function') instanceof r1.evaluate('Function'));
  t.ok(r2.evaluate('Function') instanceof r1.evaluate('Object'));
  t.ok(r2.evaluate('Function') instanceof Function);
  t.ok(r2.evaluate('Function') instanceof Object);
  t.notEqual(r2.evaluate('Function'), r1.evaluate('Function'));
  t.notEqual(r2.evaluate('Function'), Function);

  const f2 = r2.evaluate('function x(a, b) { return a+b; }; x');
  t.ok(f2 instanceof r1.global.Function);
  t.ok(f2 instanceof r2.global.Function);
  t.ok(f2 instanceof r3.global.Function);
});
