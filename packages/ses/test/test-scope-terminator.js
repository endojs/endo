import test from 'ava';
import { createScopeTerminator } from '../src/scope-terminator.js';

test('scopeTerminator - always has start compartment properties but they are undefined', t => {
  t.plan(4);

  const globalObject = {};
  const { scopeTerminator } = createScopeTerminator(globalObject);

  t.is(Reflect.has(scopeTerminator, 'eval'), true);
  t.is(Reflect.get(scopeTerminator, 'eval'), undefined);

  t.is(Reflect.has(scopeTerminator, 'xyz'), false);
  t.is(Reflect.get(scopeTerminator, 'xyz'), undefined);
});

test('scopeTerminator - always has all properties when in sloppyGlobalsMode but they are undefined', t => {
  t.plan(4);

  const globalObject = {};
  const { scopeTerminator } = createScopeTerminator(globalObject, {
    sloppyGlobalsMode: true,
  });

  t.is(Reflect.has(scopeTerminator, 'eval'), true);
  t.is(Reflect.get(scopeTerminator, 'eval'), undefined);

  t.is(Reflect.has(scopeTerminator, 'xyz'), true);
  t.is(Reflect.get(scopeTerminator, 'xyz'), undefined);
});

test('scopeTerminator - in sloppyGlobalsMode, sets happen on the globalObject', t => {
  t.plan(3);

  const globalObject = {};
  const { scopeTerminator } = createScopeTerminator(globalObject, {
    sloppyGlobalsMode: true,
  });

  t.is(Reflect.set(scopeTerminator, 'xyz', 42), true);
  t.is(Reflect.get(scopeTerminator, 'xyz'), undefined);
  t.is(Reflect.get(globalObject, 'xyz'), 42);
});

test('scopeTerminator - in sloppyGlobalsMode, sets fail', t => {
  t.plan(1);

  const globalObject = {};
  const { scopeTerminator } = createScopeTerminator(globalObject);

  t.is(Reflect.set(scopeTerminator, 'xyz', 42), false);
});
