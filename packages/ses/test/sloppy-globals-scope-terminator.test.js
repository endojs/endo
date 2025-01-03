// @ts-nocheck
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
  t.plan(5);

  const globalObject = {};
  const scopeTerminator = createSloppyGlobalsScopeTerminator(globalObject);

  // Mute warnings
  const originalWarn = console.warn;
  t.teardown(() => {
    console.warn = originalWarn;
  });
  console.warn = () => {};

  t.is(Reflect.has(scopeTerminator, 'eval'), true);
  t.is(Reflect.getOwnPropertyDescriptor(scopeTerminator, 'eval'), undefined);
  t.is(Reflect.has(scopeTerminator, 'xyz'), true);
  t.is(Reflect.getOwnPropertyDescriptor(scopeTerminator, 'xyz'), undefined);
  t.deepEqual(Reflect.ownKeys(scopeTerminator), []);
});

test('sloppyGlobalsScopeTerminator/etc - all other handlers throw errors', t => {
  t.plan(7);

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
  t.throws(() => Reflect.preventExtensions(scopeTerminator), {
    instanceOf: Error,
  });
  t.throws(() => Reflect.setPrototypeOf(scopeTerminator), {
    instanceOf: Error,
  });
});
