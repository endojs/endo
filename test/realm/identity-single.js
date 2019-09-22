import test from 'tape';
import Evaluator from '../../src/evaluator';

// JSON is an ordinary intrinsic
test('identity JSON', t => {
  t.plan(5);

  const r = new Evaluator();

  t.equal(r.evaluate('JSON'), r.evaluate('JSON'));
  t.equal(r.evaluate('JSON'), r.evaluate('(1,eval)("JSON")'));
  t.equal(r.evaluate('JSON'), r.evaluate('(new Function("return JSON"))()'));
  t.equal(r.evaluate('JSON'), r.global.JSON);
  t.equal(r.evaluate('JSON'), JSON);
});

// Evaluator is a shared global
test('identity Evaluator', t => {
  t.plan(5);

  const r = new Evaluator();

  t.ok(r.evaluate('Evaluator instanceof Function'));
  t.ok(r.evaluate('Evaluator instanceof Object'));
  t.ok(r.evaluate('Evaluator') instanceof Function);
  t.ok(r.evaluate('Evaluator') instanceof Object);
  t.equal(r.evaluate('Evaluator'), Evaluator);
});

// eval is realm-specific
test('identity eval', t => {
  t.plan(6);

  const r = new Evaluator();

  t.ok(r.evaluate('eval instanceof Function'));
  t.ok(r.evaluate('eval instanceof Object'));
  t.ok(r.evaluate('eval') instanceof r.global.Function);
  t.ok(r.evaluate('eval') instanceof r.global.Object);
  t.ok(r.evaluate('eval') instanceof Function);
  t.ok(r.evaluate('eval') instanceof Object);
});

// Function is realm-specific
test('identity Function', t => {
  t.plan(8);

  const r = new Evaluator();

  t.ok(r.evaluate('Function instanceof Function'));
  t.ok(r.evaluate('Function instanceof Object'));
  t.ok(r.evaluate('Function') instanceof r.global.Function);
  t.ok(r.evaluate('Function') instanceof r.global.Object);
  t.ok(r.evaluate('Function') instanceof Function);
  t.ok(r.evaluate('Function') instanceof Object);

  const f = r.evaluate('function x(a, b) { return a+b; }; x');
  t.ok(f instanceof r.global.Function);
  t.ok(f instanceof Function);
});
