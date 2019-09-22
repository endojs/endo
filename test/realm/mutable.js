import test from 'tape';
import Evaluator from '../../src/evaluator';

test('most globals are mutable', t => {
  t.plan(3);
  const r = new Evaluator();

  r.evaluate('Date = function() { return "bogus" }');
  t.equal(r.evaluate('Date()'), 'bogus');

  r.evaluate('Math.embiggen = function(a) { return a+1 }');
  t.equal(r.evaluate('Math.embiggen(1)'), 2);

  r.evaluate('Evaluator = function(opts) { this.extra = "extra" }');
  t.equal(r.evaluate('(new Evaluator({})).extra'), 'extra');
});

test('some globals are immutable', t => {
  t.plan(6);
  const r = new Evaluator();

  t.throws(() => r.evaluate('Infinity = 4'), TypeError); // strict mode
  t.equal(r.evaluate('Infinity'), Infinity);

  t.throws(() => r.evaluate('NaN = 4'), TypeError);
  t.notEqual(r.evaluate('NaN'), 4);

  t.throws(() => r.evaluate('undefined = 4'), TypeError);
  t.equal(r.evaluate('undefined'), undefined);
});
