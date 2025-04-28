import test from '@endo/ses-ava/prepare-endo.js';

import { objectMetaMap } from '@endo/common/object-meta-map.js';
import { testFullOrderEQ } from '@endo/marshal/tools/ava-full-order-eq.js';
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

  const FooI = M.interface('Foo', {
    m: M.call().returns(),
    m2: M.call(M.boolean()).returns(),
  });
  // Cannot use `t.deepEqual` because it does not recognize that two
  // unregistered symbols with the same `description` are the same in
  // our distributed object semantics. Unfortunately, `compareRank` is
  // too imprecise. We'd like to also test `keyEQ`, but that would violate
  // our package layering.
  testFullOrderEQ(t, getInterfaceMethodKeys(FooI), ['m', 'm2']);
  const makeFoo = defineExoClass(
    'Foo',
    FooI,
    () => ({}),
    denumerate({
      m() {},
      m2() {},
    }),
  );
  const foo = makeFoo();
  t.deepEqual(foo[GET_INTERFACE_GUARD](), FooI);
  t.throws(() => foo.m2('invalid arg'), {
    message:
      'In "m2" method of (Foo): arg 0: string "invalid arg" - Must be a boolean',
  });
});
