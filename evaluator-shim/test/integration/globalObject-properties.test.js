import test from 'tape';
import sinon from 'sinon';
import Evaluator from '../../src/evaluator';

test('globalObject properties', t => {
  t.plan(13);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });

  // eslint-disable-next-line no-new-func
  const globalObject = new Function('return this;')();
  const e = new Evaluator();

  t.notEqual(e.global, this);
  t.notEqual(e.global, global);
  t.notEqual(e.global, globalObject);

  t.equal(e.global.Array, Array);
  t.equal(e.global.Array, global.Array);
  t.equal(e.global.Array, globalObject.Array);

  // eslint-disable-next-line no-eval
  t.notEqual(e.global.eval, eval);
  // eslint-disable-next-line no-eval
  t.notEqual(e.global.eval, global.eval);
  t.notEqual(e.global.eval, globalObject.eval);

  t.notEqual(e.global.Function, Function);
  t.notEqual(e.global.Function, global.Function);
  t.notEqual(e.global.Function, globalObject.Function);

  t.equal(e.global.Evaluator, Evaluator);

  sinon.restore();
});
