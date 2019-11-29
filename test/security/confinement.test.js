import test from 'tape';
import sinon from 'sinon';
import Evaluator from '../../src/evaluator';

test('confinement evaluation strict mode', t => {
  t.plan(2);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });

  const e = new Evaluator();

  t.equal(e.evaluateScript('(function() { return this })()'), undefined);
  t.equal(e.evaluateScript('(new Function("return this"))()'), undefined);

  sinon.restore();
});

test('constructor this binding', t => {
  t.plan(5);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });

  const e = new Evaluator();
  const F = e.evaluateScript('(new Function("return this"))');

  t.equal(F(), undefined);
  t.equal(F.call(8), 8);
  t.equal(F.call(undefined), undefined);
  t.equal(Reflect.apply(F, 8, []), 8);

  const x = { F };
  t.equal(x.F(), x);

  sinon.restore();
});

test('confinement evaluation constructor', t => {
  t.plan(2);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });

  const e = new Evaluator();

  t.throws(() => {
    e.evaluateScript('({}).constructor.constructor("return this")()');
  }, Error);

  // Error is a function, so Error.__proto__ is Function.prototype . The
  // unpatched Function.prototype.constructor used to point at the unsafe
  // 'Function' object, which would provide access to the primal realm's
  // globals, so it must be kept out of the hands of any child realm. We
  // replace that '.constructor' with a safe replacement (which always
  // throws). Here we test that this constructor has been replaced.
  t.throws(() => {
    e.evaluateScript('Error.__proto__.constructor("return this")()');
  }, Error);

  sinon.restore();
});

test('confinement evaluation eval', t => {
  t.plan(2);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });

  const e = new Evaluator();

  // Strict mode
  t.equal(e.evaluateScript('(0, eval)("this")'), e.global);
  t.equal(e.evaluateScript('var evil = eval; evil("this")'), e.global);

  sinon.restore();
});
