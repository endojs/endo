import test from 'tape';
import sinon from 'sinon';
import Evaluator from '../../src/evaluator';

test('globalObject properties mutabile', t => {
  t.plan(3);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });

  const e = new Evaluator();

  e.evaluateScript('Date = function() { return "bogus" }');
  t.equal(e.evaluateScript('Date()'), 'bogus');

  e.evaluateScript('Math.embiggen = function(a) { return a+1 }');
  t.equal(e.evaluateScript('Math.embiggen(1)'), 2);

  e.evaluateScript('Evaluator = function(opts) { this.extra = "extra" }');
  t.equal(e.evaluateScript('(new Evaluator({})).extra'), 'extra');

  sinon.restore();
});

test('globalObject properties immutable', t => {
  t.plan(6);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });

  const e = new Evaluator();

  t.throws(() => e.evaluateScript('Infinity = 4'), TypeError); // strict mode
  t.equal(e.evaluateScript('Infinity'), Infinity);

  t.throws(() => e.evaluateScript('NaN = 4'), TypeError);
  t.notEqual(e.evaluateScript('NaN'), 4);

  t.throws(() => e.evaluateScript('undefined = 4'), TypeError);
  t.equal(e.evaluateScript('undefined'), undefined);

  sinon.restore();
});
