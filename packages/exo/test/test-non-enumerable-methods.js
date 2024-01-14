// eslint-disable-next-line import/order
import { test } from './prepare-test-env-ava.js';

// eslint-disable-next-line import/order
import { getInterfaceMethodKeys, M } from '@endo/patterns';
import { defineExoClass } from '../src/exo-makers.js';
import { GET_INTERFACE_GUARD } from '../src/get-interface.js';

const { getPrototypeOf, getOwnPropertyDescriptors, create, fromEntries } =
  Object;

const { ownKeys } = Reflect;

/**
 * Borrowed from https://github.com/endojs/endo/pull/1815 to avoid
 * depending on it being merged. TODO If it is merged, then delete this
 * copy and import `objectMetaMap` instead.
 *
 * Like `objectMap`, but at the reflective level of property descriptors
 * rather than property values.
 *
 * Except for hardening, the edge case behavior is mostly the opposite of
 * the `objectMap` edge cases.
 *    * No matter how mutable the original object, the returned object is
 *      hardened.
 *    * All own properties of the original are mapped, even if symbol-named
 *      or non-enumerable.
 *    * If any of the original properties were accessors, the descriptor
 *      containing the getter and setter are given to `metaMapFn`.
 *    * The own properties of the returned are according to the descriptors
 *      returned by `metaMapFn`.
 *    * The returned object will always be a plain object whose state is
 *      only these mapped own properties. It will inherit from the third
 *      argument if provided, defaulting to `Object.prototype` if omitted.
 *
 * Because a property descriptor is distinct from `undefined`, we bundle
 * mapping and filtering together. When the `metaMapFn` returns `undefined`,
 * that property is omitted from the result.
 *
 * @template {Record<PropertyKey, any>} O
 * @param {O} original
 * @param {(
 *   desc: TypedPropertyDescriptor<O[keyof O]>,
 *   key: keyof O
 * ) => (PropertyDescriptor | undefined)} metaMapFn
 * @param {any} [proto]
 * @returns {any}
 */
export const objectMetaMap = (
  original,
  metaMapFn,
  proto = Object.prototype,
) => {
  const descs = getOwnPropertyDescriptors(original);
  const keys = ownKeys(original);

  const descEntries = /** @type {[PropertyKey,PropertyDescriptor][]} */ (
    keys
      .map(key => [key, metaMapFn(descs[key], key)])
      .filter(([_key, optDesc]) => optDesc !== undefined)
  );
  return harden(create(proto, fromEntries(descEntries)));
};
harden(objectMetaMap);

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
