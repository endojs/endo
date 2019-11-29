import test from 'tape';
import sinon from 'sinon';
import { createFunctionConstructor } from '../../src/functionConstructor';

test('functionConstructor', t => {
  t.plan(12);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });

  // eslint-disable-next-line no-new-func
  const unsafeGlobal = Function('return this;')();
  const realmRec = { intrinsics: { eval: unsafeGlobal.eval, Function } }; // bypass esm
  const globalObject = Object.create(
    {},
    {
      foo: { value: 1 },
      bar: { value: 2, writable: true },
    },
  );
  const safeFunction = createFunctionConstructor(realmRec, globalObject);

  t.equal(safeFunction('return foo')(), 1);
  t.equal(safeFunction('return bar')(), 2);
  // t.equal(safeFunction('return this.foo')(), 1);
  // t.equal(safeFunction('return this.bar')(), 2);

  t.throws(() => safeFunction('foo = 3')(), TypeError);
  t.doesNotThrow(() => safeFunction('bar = 4')());

  t.equal(safeFunction('return foo')(), 1);
  t.equal(safeFunction('return bar')(), 4);
  // t.equal(safeFunction('return this.foo')(), 1);
  // t.equal(safeFunction('return this.bar')(), 4);

  const fnFoo = safeFunction('foo', 'return foo');
  t.equal(fnFoo(5), 5);
  t.equal(fnFoo(6, 7), 6);

  const fnBar = safeFunction('foo, bar', 'return bar');
  t.equal(fnBar(5), undefined);
  t.equal(fnBar(6, 7), 7);

  const fnThisFoo = safeFunction('foo', 'return this.foo');
  t.throws(() => fnThisFoo.call(undefined, 9), TypeError);
  t.equal(fnThisFoo.call({ foo: 8 }, 9), 8);

  sinon.restore();
});
