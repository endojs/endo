import test from 'ava';
import { strictScopeTerminator } from '../src/strict-scope-terminator.js';

test('strictScopeTerminator/get - always has start compartment properties but they are undefined', t => {
  t.plan(4);

  t.is(Reflect.has(strictScopeTerminator, 'eval'), true);
  t.is(Reflect.get(strictScopeTerminator, 'eval'), undefined);

  t.is(Reflect.has(strictScopeTerminator, 'xyz'), false);
  t.is(Reflect.get(strictScopeTerminator, 'xyz'), undefined);
});

test('strictScopeTerminator/set - always disallows sets', t => {
  t.plan(2);

  // disallows set because eval exists on the global object
  t.is(Reflect.set(strictScopeTerminator, 'eval', 42), false);
  // disallows set because xyz does not exist on the global object
  t.is(Reflect.set(strictScopeTerminator, 'xyz', 42), false);
});

test('strictScopeTerminator/getPrototypeOf - has null prototype', t => {
  t.plan(1);

  t.is(Reflect.getPrototypeOf(strictScopeTerminator), null);
});

test('strictScopeTerminator/getOwnPropertyDescriptor - always has start compartment properties but provides no prop desc', t => {
  t.plan(8);

  const originalWarn = console.warn;
  let didWarn = 0;
  console.warn = () => {
    didWarn += 1;
  };

  t.is(Reflect.has(strictScopeTerminator, 'eval'), true);
  t.is(didWarn, 0);
  t.is(
    Reflect.getOwnPropertyDescriptor(strictScopeTerminator, 'eval'),
    undefined,
  );
  t.is(didWarn, 1);
  t.is(Reflect.has(strictScopeTerminator, 'xyz'), false);
  t.is(didWarn, 1);
  t.is(
    Reflect.getOwnPropertyDescriptor(strictScopeTerminator, 'xyz'),
    undefined,
  );
  t.is(didWarn, 2);

  console.warn = originalWarn;
});

test('strictScopeTerminator/etc - all other handlers throw errors', t => {
  t.plan(8);

  t.throws(() => Reflect.apply(strictScopeTerminator), { instanceOf: Error });
  t.throws(() => Reflect.construct(strictScopeTerminator), {
    instanceOf: Error,
  });
  t.throws(() => Reflect.defineProperty(strictScopeTerminator), {
    instanceOf: Error,
  });
  t.throws(() => Reflect.deleteProperty(strictScopeTerminator), {
    instanceOf: Error,
  });
  t.throws(() => Reflect.isExtensible(strictScopeTerminator), {
    instanceOf: Error,
  });
  t.throws(() => Reflect.ownKeys(strictScopeTerminator), { instanceOf: Error });
  t.throws(() => Reflect.preventExtensions(strictScopeTerminator), {
    instanceOf: Error,
  });
  t.throws(() => Reflect.setPrototypeOf(strictScopeTerminator), {
    instanceOf: Error,
  });
});
