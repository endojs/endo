import test from 'ava';
import { apply, freeze } from '../src/commons.js';
import { makeEvaluate } from '../src/make-evaluate.js';
import { strictScopeTerminator } from '../src/strict-scope-terminator.js';
import { makeEvalScopeKit } from '../src/eval-scope.js';

const makeObservingProxy = target => {
  const ops = [];
  const proxy = new Proxy(target, {
    get(_target, prop, _receiver) {
      if (prop !== Symbol.unscopables) {
        ops.push(['get', prop]);
      }
      return Reflect.get(target, prop);
    },
  });

  return [proxy, ops];
};

test('makeEvaluate - optimizer', t => {
  t.plan(5);

  const globalObjectTarget = Object.create(null, {
    foo: { value: true },
    bar: { value: true },
    baz: { value: true, writable: true },
  });
  const moduleLexicalsTarget = Object.create(null, { foo: { value: false } });

  const [globalObject, globalObjectOps] =
    makeObservingProxy(globalObjectTarget);
  const [moduleLexicals, moduleLexicalsOps] =
    makeObservingProxy(moduleLexicalsTarget);

  const scopeTerminator = strictScopeTerminator;
  const evalScopeKit = makeEvalScopeKit();
  const { evalScope } = evalScopeKit;

  const evaluate = makeEvaluate(
    freeze({ scopeTerminator, globalObject, moduleLexicals, evalScope }),
  );

  t.deepEqual(globalObjectOps, [['get', 'bar']]);
  t.deepEqual(moduleLexicalsOps, [['get', 'foo']]);

  globalObjectOps.length = 0;
  moduleLexicalsOps.length = 0;

  evalScopeKit.allowNextEvalToBeUnsafe();

  const result = apply(evaluate, globalObject, [`!foo && bar && baz`]);

  t.is(result, true);
  t.deepEqual(globalObjectOps, [['get', 'baz']]);
  t.deepEqual(moduleLexicalsOps, []);
});

test('makeEvaluate - strict-mode', t => {
  t.plan(2);

  const globalObject = Object.create(null);
  const moduleLexicals = Object.create(null);

  const scopeTerminator = strictScopeTerminator;
  const evalScopeKit = makeEvalScopeKit();
  const { evalScope } = evalScopeKit;

  const evaluate = makeEvaluate(
    freeze({ scopeTerminator, globalObject, moduleLexicals, evalScope }),
  );

  evalScopeKit.allowNextEvalToBeUnsafe();
  t.throws(() => apply(evaluate, globalObject, [`foo = 42`]));

  evalScopeKit.allowNextEvalToBeUnsafe();
  t.throws(() => apply(evaluate, globalObject, [`with({}) {}`]));
});
