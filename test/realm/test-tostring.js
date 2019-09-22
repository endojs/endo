import test from 'tape';
import Evaluator from '../../src/evaluator';

test('eval.toString', t => {
  const r = new Evaluator();

  t.equal(r.evaluate('eval.toString()'), 'function eval() { [shim code] }');
  t.equal(r.evaluate('""+eval'), 'function eval() { [shim code] }');

  t.equal(
    r.evaluate('Object.getPrototypeOf(eval.toString)'),
    r.global.Function.prototype,
    'eval has correct prototype'
  );
  t.equal(
    r.evaluate('Object.getPrototypeOf(eval.toString)'),
    Function.prototype,
    "eval doesn't leak primal Function.prototype"
  );
  t.end();
});
