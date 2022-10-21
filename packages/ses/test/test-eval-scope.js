import test from 'ava';
import { makeEvalScopeKit } from '../src/eval-scope.js';

// The original unsafe untamed eval function, which must not escape.
// Sample at module initialization time, which is before lockdown can
// repair it.  Use it only to build powerless abstractions.
// eslint-disable-next-line no-eval
const FERAL_EVAL = eval;

test('evalScope - is not created with eval exposed', t => {
  t.plan(2);

  const evalScopeKit = makeEvalScopeKit();
  const { evalScope } = evalScopeKit;

  t.is(Reflect.has(evalScope, 'eval'), false);

  evalScopeKit.allowNextEvalToBeUnsafe();

  t.is(Reflect.has(evalScope, 'eval'), true);
});

test('evalScope - getting eval removes it from evalScope', t => {
  t.plan(5);

  const evalScopeKit = makeEvalScopeKit();
  const { evalScope } = evalScopeKit;

  t.is(Reflect.has(evalScope, 'eval'), false);

  evalScopeKit.allowNextEvalToBeUnsafe();

  t.is(Reflect.has(evalScope, 'eval'), true);

  t.is(Reflect.get(evalScope, 'eval'), FERAL_EVAL);

  t.is(Reflect.get(evalScope, 'eval'), undefined);
  t.is(Reflect.has(evalScope, 'eval'), false);
});
