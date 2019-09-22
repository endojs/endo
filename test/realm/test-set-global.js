import test from 'tape';
import Evaluator from '../../src/evaluator';

test('set globals', t => {
  const r = new Evaluator();

  // strict mode should prevent this
  t.throws(() => r.evaluate('evil = 666'), ReferenceError);

  r.global.victim = 3;
  r.evaluate('victim = 666');
  t.equal(r.global.victim, 666);

  t.end();
});
