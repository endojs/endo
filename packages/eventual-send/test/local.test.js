import '@endo/lockdown/commit-debug.js';
import test from 'ava';

import {
  getMethodNames,
  localApplyFunction,
  localApplyMethod,
  localGet,
} from '../src/local.js';

test('getMethodNames returns sorted method names', t => {
  const obj = {
    beta() {},
    alpha() {},
    gamma: 'not a method',
  };
  const names = getMethodNames(obj);
  t.true(names.includes('alpha'));
  t.true(names.includes('beta'));
  t.false(names.includes('gamma'));
});

test('getMethodNames includes inherited methods', t => {
  const parent = { inherited() {} };
  const child = Object.create(parent);
  child.own = function own() {};
  const names = getMethodNames(child);
  t.true(names.includes('inherited'));
  t.true(names.includes('own'));
});

test('getMethodNames handles null prototype object', t => {
  const obj = Object.create(null);
  obj.foo = function foo() {};
  const names = getMethodNames(obj);
  t.deepEqual(names, ['foo']);
});

test('getMethodNames with symbol-keyed methods', t => {
  const sym = Symbol.for('testMethod');
  const obj = { [sym]() {} };
  const names = getMethodNames(obj);
  t.true(names.includes(sym));
});

test('getMethodNames sorts symbols before strings', t => {
  const symA = Symbol.for('alpha');
  const symB = Symbol.for('beta');
  // Place a string method between two symbol methods in declaration order
  // to ensure the sort comparator handles both (symbol, string) and
  // (string, symbol) orderings.
  const obj = {
    [symB]() {},
    middle() {},
    [symA]() {},
    zzz() {},
    aaa() {},
  };
  const names = getMethodNames(obj);
  // Symbols should come first, sorted among themselves
  const symbols = names.filter(n => typeof n === 'symbol');
  t.deepEqual(symbols, [symA, symB]);
  // Strings should come after, sorted among themselves
  const strings = names.filter(n => typeof n === 'string');
  t.deepEqual(strings, ['aaa', 'middle', 'zzz']);
  // Overall: symbols first, then strings
  t.is(names.indexOf(symA), 0);
  t.is(names.indexOf(symB), 1);
});

test('localApplyFunction calls the function', t => {
  const fn = (a, b) => a + b;
  t.is(localApplyFunction(fn, [3, 4]), 7);
});

test('localApplyFunction throws for non-function', t => {
  t.throws(() => localApplyFunction('not a function', []), {
    instanceOf: TypeError,
  });
});

test('localApplyMethod calls the method', t => {
  const obj = { add: (a, b) => a + b };
  t.is(localApplyMethod(obj, 'add', [2, 3]), 5);
});

test('localApplyMethod with undefined methodName delegates to applyFunction', t => {
  const fn = x => x * 2;
  t.is(localApplyMethod(fn, undefined, [5]), 10);
});

test('localApplyMethod with null methodName delegates to applyFunction', t => {
  const fn = x => x + 1;
  t.is(localApplyMethod(fn, null, [9]), 10);
});

test('localApplyMethod throws for undefined recipient', t => {
  t.throws(() => localApplyMethod(undefined, 'foo', []), {
    instanceOf: TypeError,
  });
});

test('localApplyMethod throws for missing method', t => {
  t.throws(() => localApplyMethod({}, 'nonexistent', []), {
    instanceOf: TypeError,
  });
});

test('localApplyMethod throws for non-function property', t => {
  t.throws(() => localApplyMethod({ x: 42 }, 'x', []), {
    message: /is not a function/,
  });
});

test('localGet reads property', t => {
  t.is(localGet({ x: 42 }, 'x'), 42);
  t.is(localGet({ x: 42 }, 'y'), undefined);
});
