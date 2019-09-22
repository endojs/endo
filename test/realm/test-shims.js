import test from 'tape';
import Evaluator from '../../src/evaluator';

test('options: no options', t => {
  t.doesNotThrow(() => new Evaluator());
  t.end();
});

test('options: empty options', t => {
  t.doesNotThrow(() => new Evaluator({}));
  t.end();
});

test('options: not supported', t => {
  t.throws(() => new Evaluator({ shims: [] }), TypeError);
  t.end();
});
