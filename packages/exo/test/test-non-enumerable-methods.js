// eslint-disable-next-line import/order
import test from '@endo/ses-ava';

// eslint-disable-next-line import/order
import { objectMetaMap } from '@endo/common/object-meta-map.js';
import { getInterfaceMethodKeys, M } from '@endo/patterns';
import { defineExoClass } from '../src/exo-makers.js';
import { GET_INTERFACE_GUARD } from '../src/get-interface.js';

const { getPrototypeOf } = Object;

const UpCounterI = M.interface('UpCounter', {
  incr: M.call()
    // TODO M.number() should not be needed to get a better error message
    .optional(M.and(M.number(), M.gte(0)))
    .returns(M.number()),
});

const denumerate = obj =>
  objectMetaMap(
    obj,
    desc => ({ ...desc, enumerable: false }),
    getPrototypeOf(obj),
  );

test('test defineExoClass', t => {
  const makeUpCounter = defineExoClass(
    'UpCounter',
    UpCounterI,
    /** @param {number} [x] */
    (x = 0) => ({ x }),
    denumerate({
      incr(y = 1) {
        const { state } = this;
        state.x += y;
        return state.x;
      },
    }),
  );
  const upCounter = makeUpCounter(3);
  t.is(upCounter.incr(5), 8);
  t.is(upCounter.incr(1), 9);
  t.throws(() => upCounter.incr(-3), {
    message: 'In "incr" method of (UpCounter): arg 0?: -3 - Must be >= 0',
  });
  // @ts-expect-error bad arg
  t.throws(() => upCounter.incr('foo'), {
    message:
      'In "incr" method of (UpCounter): arg 0?: string "foo" - Must be a number',
  });
  t.deepEqual(upCounter[GET_INTERFACE_GUARD](), UpCounterI);
  t.deepEqual(getInterfaceMethodKeys(UpCounterI), ['incr']);

  const symbolic = Symbol.for('symbolic');
  const FooI = M.interface('Foo', {
    m: M.call().returns(),
    [symbolic]: M.call(M.boolean()).returns(),
  });
  t.deepEqual(getInterfaceMethodKeys(FooI), ['m', Symbol.for('symbolic')]);
  const makeFoo = defineExoClass(
    'Foo',
    FooI,
    () => ({}),
    denumerate({
      m() {},
      [symbolic]() {},
    }),
  );
  const foo = makeFoo();
  t.deepEqual(foo[GET_INTERFACE_GUARD](), FooI);
  t.throws(() => foo[symbolic]('invalid arg'), {
    message:
      'In "[Symbol(symbolic)]" method of (Foo): arg 0: string "invalid arg" - Must be a boolean',
  });
});
