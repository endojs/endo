/* global globalThis */

const {
  Object,
  Reflect,
  TypeError,
  String,
  JSON,
  Error,
  // eslint-disable-next-line no-restricted-globals
} = globalThis;

const {
  freeze,
  defineProperty,
  getOwnPropertyDescriptor,
  getOwnPropertyDescriptors,
  hasOwn,
} = Object;
const { apply, ownKeys } = Reflect;

const { stringify } = JSON;
const q = v => (typeof v === 'symbol' ? String(v) : stringify(v));

/**
 * For when we know the property exists and it is an accessor property with
 * a getter.
 *
 * @param {object} obj
 * @param {PropertyKey} key
 * @returns {() => any}
 */
export const getGetter = (obj, key) => {
  const getter = getOwnPropertyDescriptor(obj, key)?.get;
  if (getter === undefined) {
    throw Error(`expected property ${q(String(key))}`);
  }
  return getter;
};

/**
 * Makes an internal intermediate prototype (a "heir") for emulated instances
 * to inherit from. This heir inherits from `parent`,
 * so anything omitted from `queryNames`, `mutatorNames`, or `others`,
 * like `constructor`, will still be inherited from `parent`. If any of
 * these validate that their `this` is a genuine one, then those
 * validations will fail on the virtual instances.
 *
 * `makeInternalHeir` samples original members from `parent`
 * and so must be called before parent might be polluted.
 * IOW, `makeInternalHeir` should be called only by a module when
 * it initializes.
 *
 * @template [T=any]
 * @param {T} proto
 * @param {string} thisPhrase
 * @param {(v: T) => T} redirect
 * @param {PropertyKey[]} queryKeys
 *   Those query methods or get-only accessors that validate their
 *   this is a ArrayBuffer, where all we need to do is redirect that validation.
 * @param {PropertyKey[]} mutatorKeys
 *   Those index-property mutating methods or accessors, where all we need to
 *   do is throw an appropriate diagnostic. This can include method names not
 *   currently on `proto`, For those, a complaining method will be
 *   installed anyway.
 * @param {Partial<T>} others
 *   An object containing the remaining members to be copied onto the
 *   virtual prototype. It is the descriptor that is copied except that
 *   `enumerable:` is set to `false`.
 * @returns {T}
 */
// This abstraction would not be justified for immutable ArrayBuffer by
// itself. Rather, it is worth it for its reuse in freezable TypedArrays.
export const makeInternalHeir = (
  proto,
  thisPhrase,
  redirect,
  queryKeys,
  mutatorKeys,
  others,
) => {
  const protoDescs = getOwnPropertyDescriptors(proto);
  const otherDescs = getOwnPropertyDescriptors(others);

  const internalHeir = /** @type {ThisType<T>} */ ({
    __proto__: proto,
  });

  for (const queryKey of queryKeys) {
    if (hasOwn(internalHeir, queryKey)) {
      throw new TypeError(`internal conflict on ${q(queryKey)}`);
    }
    // @ts-expect-error known TS bug. Symbols are valid indexes
    const protoDesc = protoDescs[queryKey];
    if (protoDesc !== undefined) {
      const protoGetter = protoDesc.get;
      if (protoGetter !== undefined) {
        const virtualGetter = getGetter(
          /** @type {ThisType<T>} */ ({
            get [queryKey]() {
              return apply(protoGetter, redirect(this), []);
            },
          }),
          queryKey,
        );
        defineProperty(internalHeir, queryKey, {
          ...protoDesc,
          get: virtualGetter,
          set: undefined,
        });
      } else {
        const protoMethod = protoDesc.value;
        if (typeof protoMethod !== 'function') {
          throw new TypeError(`internal unexpected non-method ${q(queryKey)}`);
        }
        const virtualMethod = /** @type {ThisType<T>} */ ({
          [queryKey](...args) {
            return apply(protoMethod, redirect(this), args);
          },
        })[queryKey];
        defineProperty(internalHeir, queryKey, {
          ...protoDesc,
          value: virtualMethod,
        });
      }
    }
  }

  for (const mutatorKey of mutatorKeys) {
    if (hasOwn(internalHeir, mutatorKey)) {
      throw new TypeError(`internal conflict on ${q(mutatorKey)}`);
    }
    // @ts-expect-error known TS bug. Symbols are valid indexes
    const protoDesc = protoDescs[mutatorKey];
    if (protoDesc !== undefined) {
      const protoGetter = protoDesc.get;
      if (protoGetter !== undefined) {
        const virtualGetter = getGetter(
          /** @type {ThisType<T>} */ ({
            get [mutatorKey]() {
              throw new TypeError(`cannot ${q(mutatorKey)} ${thisPhrase}`);
            },
          }),
          mutatorKey,
        );
        defineProperty(internalHeir, mutatorKey, {
          ...protoDesc,
          get: virtualGetter,
          set: virtualGetter, // weird but better diagnostic
        });
        // eslint-disable-next-line no-continue
        continue;
      }
    }
    // For the mutator, we install a complaining method whether or
    // not one was on proto
    const virtualMethod = /** @type {ThisType<T>} */ ({
      [mutatorKey](..._args) {
        throw new TypeError(`cannot ${q(mutatorKey)} ${thisPhrase}`);
      },
    })[mutatorKey];
    defineProperty(internalHeir, mutatorKey, {
      writable: true,
      enumerable: false,
      configurable: true,
      ...protoDesc,
      value: virtualMethod,
    });
  }

  for (const key of ownKeys(otherDescs)) {
    if (hasOwn(internalHeir, key)) {
      throw new TypeError(`internal conflict on ${q(key)}`);
    }
    // @ts-expect-error known TS bug. Symbols are valid indexes
    const otherDesc = otherDescs[key];
    defineProperty(internalHeir, key, {
      ...otherDesc,
      enumerable: false,
    });
  }

  return /** @type {T} */ (internalHeir);
};
freeze(makeInternalHeir);
