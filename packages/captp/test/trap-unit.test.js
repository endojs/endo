import test from '@endo/ses-ava/test.js';

import { nearTrapImpl, makeTrap } from '../src/trap.js';

test('nearTrapImpl.applyFunction calls target', t => {
  const fn = (a, b) => a + b;
  t.is(nearTrapImpl.applyFunction(fn, [3, 4]), 7);
});

test('nearTrapImpl.applyMethod calls method on target', t => {
  const obj = { greet: name => `hello ${name}` };
  t.is(nearTrapImpl.applyMethod(obj, 'greet', ['world']), 'hello world');
});

test('nearTrapImpl.get reads property', t => {
  const obj = { x: 42 };
  t.is(nearTrapImpl.get(obj, 'x'), 42);
});

test('makeTrap creates callable proxy', t => {
  const Trap = makeTrap(nearTrapImpl);
  const obj = { add: (a, b) => a + b };
  const trapped = Trap(obj);
  t.is(trapped.add(2, 3), 5);
});

test('makeTrap proxy is not extensible', t => {
  const Trap = makeTrap(nearTrapImpl);
  const obj = { x: 1 };
  const trapped = Trap(obj);
  t.false(Object.isExtensible(trapped));
});

test('makeTrap proxy rejects set', t => {
  const Trap = makeTrap(nearTrapImpl);
  const obj = { x: 1 };
  const trapped = Trap(obj);
  t.throws(
    () => {
      trapped.newProp = 'bad';
    },
    { instanceOf: TypeError },
  );
});

test('makeTrap proxy rejects deleteProperty', t => {
  const Trap = makeTrap(nearTrapImpl);
  const obj = { x: 1 };
  const trapped = Trap(obj);
  t.throws(
    () => {
      delete trapped.x;
    },
    { instanceOf: TypeError },
  );
});

test('makeTrap proxy rejects setPrototypeOf', t => {
  const Trap = makeTrap(nearTrapImpl);
  const obj = { x: 1 };
  const trapped = Trap(obj);
  t.throws(() => Object.setPrototypeOf(trapped, {}), { instanceOf: TypeError });
});

test('Trap.get creates getter proxy', t => {
  const Trap = makeTrap(nearTrapImpl);
  const obj = { x: 42, y: 'hello' };
  const getter = Trap.get(obj);
  t.is(getter.x, 42);
  t.is(getter.y, 'hello');
});

test('Trap proxy has returns true', t => {
  const Trap = makeTrap(nearTrapImpl);
  const obj = { x: 1 };
  const trapped = Trap(obj);
  t.true('anything' in trapped);
});

test('Trap proxy apply invokes applyFunction', t => {
  const Trap = makeTrap(nearTrapImpl);
  const fn = x => x * 2;
  const trapped = Trap(fn);
  t.is(trapped(5), 10);
});
