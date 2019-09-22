import test from 'tape';
import Evaluator from '../../src/evaluator';

// eslint-disable-next-line no-new-func
const unsafeGlobal = new Function('return this;')();

test('new Evaluator - globals', t => {
  t.plan(12);

  const evaluator = new Evaluator();
  const safeGlobal = evaluator.global;

  t.notEqual(safeGlobal, this);
  t.notEqual(safeGlobal, global);
  t.notEqual(safeGlobal, unsafeGlobal);

  t.equal(safeGlobal.JSON, JSON);
  t.equal(safeGlobal.JSON, global.JSON);
  t.equal(safeGlobal.JSON, unsafeGlobal.JSON);

  const safeEval = evaluator.eval;

  t.notEqual(safeEval, eval);
  t.notEqual(safeEval, global.eval);
  t.notEqual(safeEval, unsafeGlobal.eval);

  const safeFunction = evaluator.Function;

  t.notEqual(safeFunction, Function);
  t.notEqual(safeFunction, global.Function);
  t.notEqual(safeFunction, unsafeGlobal.Function);
});
