import test from 'ava';
import { createSloppyGlobalsScopeTerminator } from '../src/sloppy-globals-scope-terminator.js';

test('sloppyGlobalsScopeTerminator/get - always has properties but they are undefined', t => {
  t.plan(4);

  const globalObject = {};
  const scopeTerminator = createSloppyGlobalsScopeTerminator(globalObject);

  t.is(Reflect.has(scopeTerminator, 'eval'), true);
  t.is(Reflect.get(scopeTerminator, 'eval'), undefined);

  t.is(Reflect.has(scopeTerminator, 'xyz'), true);
  t.is(Reflect.get(scopeTerminator, 'xyz'), undefined);
});

test('sloppyGlobalsScopeTerminator/set - sets happen on the globalObject', t => {
  t.plan(6);

  const globalObject = {};
  const scopeTerminator = createSloppyGlobalsScopeTerminator(globalObject);

  t.is(Reflect.set(scopeTerminator, 'eval', 42), true);
  t.is(Reflect.get(scopeTerminator, 'eval'), undefined);
  t.is(Reflect.get(globalObject, 'eval'), 42);

  t.is(Reflect.set(scopeTerminator, 'xyz', 42), true);
  t.is(Reflect.get(scopeTerminator, 'xyz'), undefined);
  t.is(Reflect.get(globalObject, 'xyz'), 42);
});

test('sloppyGlobalsScopeTerminator/getPrototypeOf - has null prototype', t => {
  t.plan(1);

  const globalObject = {};
  const scopeTerminator = createSloppyGlobalsScopeTerminator(globalObject);

  t.is(Reflect.getPrototypeOf(scopeTerminator), null);
});

test('sloppyGlobalsScopeTerminator/getOwnPropertyDescriptor - always has start compartment properties but provides no prop desc', t => {
  t.plan(8);

  const globalObject = {};
  const scopeTerminator = createSloppyGlobalsScopeTerminator(globalObject);

  const originalWarn = console.warn;
  let didWarn = 0;
  console.warn = () => {
    didWarn += 1;
  };

  t.is(Reflect.has(scopeTerminator, 'eval'), true);
  t.is(didWarn, 0);
  t.is(Reflect.getOwnPropertyDescriptor(scopeTerminator, 'eval'), undefined);
  t.is(didWarn, 1);
  t.is(Reflect.has(scopeTerminator, 'xyz'), true);
  t.is(didWarn, 1);
  t.is(Reflect.getOwnPropertyDescriptor(scopeTerminator, 'xyz'), undefined);
  t.is(didWarn, 2);

  console.warn = originalWarn;
});

test('sloppyGlobalsScopeTerminator/etc - all other handlers throw errors', t => {
  t.plan(8);

  const globalObject = {};
  const scopeTerminator = createSloppyGlobalsScopeTerminator(globalObject);

  t.throws(() => Reflect.apply(scopeTerminator), { instanceOf: Error });
  t.throws(() => Reflect.construct(scopeTerminator), { instanceOf: Error });
  t.throws(() => Reflect.defineProperty(scopeTerminator), {
    instanceOf: Error,
  });
  t.throws(() => Reflect.deleteProperty(scopeTerminator), {
    instanceOf: Error,
  });
  t.throws(() => Reflect.isExtensible(scopeTerminator), { instanceOf: Error });
  t.throws(() => Reflect.ownKeys(scopeTerminator), { instanceOf: Error });
  t.throws(() => Reflect.preventExtensions(scopeTerminator), {
    instanceOf: Error,
  });
  t.throws(() => Reflect.setPrototypeOf(scopeTerminator), {
    instanceOf: Error,
  });
});
