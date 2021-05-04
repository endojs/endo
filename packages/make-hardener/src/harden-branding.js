// @ts-check

const {
  freeze: originalFreeze,
  seal: originalSeal,
  preventExtensions: originalObjectPreventExtensions,
  isExtensible,
  isFrozen,
  values,
  getOwnPropertyDescriptor,
  getPrototypeOf,
  defineProperties,
} = Object;
const { preventExtensions: originalReflectPreventExtensions } = Reflect;
const { add: weakSetAdd, delete: weakSetDelete } = WeakSet.prototype;

/**
 * Is `v` a primitive value. This code *assumes* that primitive values
 * are transitively primitive and thus transitively immutable.
 * TODO The records-and-tuples proposal *may* be break this
 * assumption, breaking the correctness and security of this code.
 *
 * @param {any} v
 */
export const isPrimitive = v =>
  v === null || (typeof v !== 'object' && typeof v !== 'function');

// There are not many effective ways to pass configuration parameters to
// a module initialization, especially a portable and early one. Elsewhere
// we use environment variables or globals. However, environment variables
// are not a host independent notion. Any in any case, this module is too
// low level to rely on something like that. So we feature test of the
// `HARDEN_BRANDING` global. We would leave it up to some higher level
// client if they wish to first initialize these globals based on
// environment variables.
if (!('HARDEN_BRANDING' in globalThis)) {
  if (typeof globalThis.print === 'function') {
    // We believe we're on XS. Because of the current scaling problems of
    // XS WeakMaps, we want to default to 'NEGATIVE' even though it is
    // dangerous.
    globalThis.HARDEN_BRANDING = 'NEGATIVE';
  } else {
    // Everywhere else, we assume that WeakMaps scale adequately well,
    // so we default to the safer 'POSITIVE' option.
    globalThis.HARDEN_BRANDING = 'POSITIVE';
  }
}

/**
 * ENABLE_POSITIVE_BRANDING and ENABLE_NEGATIVE_BRANDING are only temporary, to
 * compare two different implementation strategies. At least one should be on.
 * Turning only one on is useful for measuring performance. Turning both on
 * checks them against each other for correctness, but is expensive.
 */
const ENABLE_POSITIVE_BRANDING = ['POSITIVE', 'BOTH'].includes(
  globalThis.HARDEN_BRANDING,
);
const ENABLE_NEGATIVE_BRANDING = ['NEGATIVE', 'BOTH'].includes(
  globalThis.HARDEN_BRANDING,
);

if (!ENABLE_POSITIVE_BRANDING && !ENABLE_NEGATIVE_BRANDING) {
  throw new Error('One of these must be true');
}

if (ENABLE_POSITIVE_BRANDING && ENABLE_NEGATIVE_BRANDING) {
  // console.log('HARDEN comparing implementations');
}

const hardened = new WeakSet();
const onlyNonExtensible = new WeakSet();

if (ENABLE_NEGATIVE_BRANDING) {
  // @ts-ignore
  // eslint-disable-next-line no-underscore-dangle
  const consoleTimes = console._times;
  const SafeMapProto = consoleTimes && getPrototypeOf(consoleTimes);
  const SafeMap = SafeMapProto && SafeMapProto.constructor;

  const possiblyAlreadyNonExtensible = {
    __proto__: null,
    // @ts-ignore
    ThrowTypeError: getOwnPropertyDescriptor(Function.prototype, 'caller').get,
    SafeMap,
    SafeMapProto,
  };

  for (const v of values(possiblyAlreadyNonExtensible)) {
    if (!isPrimitive(v) && !isExtensible(v)) {
      // @ts-ignore
      onlyNonExtensible.add(v);
    }
  }

  const patchObjectMethods = {
    freeze(target) {
      if (isExtensible(target)) {
        onlyNonExtensible.add(target);
      }
      return originalFreeze(target);
    },
    seal(target) {
      if (isExtensible(target)) {
        onlyNonExtensible.add(target);
      }
      return originalSeal(target);
    },
    preventExtensions(target) {
      if (isExtensible(target)) {
        onlyNonExtensible.add(target);
      }
      return originalObjectPreventExtensions(target);
    },
  };

  const patchReflectMethods = {
    // Note that Object.preventExtensions has a slightly different
    // semantics than Reflect.preventExtensions
    preventExtensions(target) {
      if (isExtensible(target)) {
        onlyNonExtensible.add(target);
      }
      return originalReflectPreventExtensions(target);
    },
  };

  defineProperties(
    Object,
    Object.getOwnPropertyDescriptors(patchObjectMethods),
  );

  defineProperties(
    Reflect,
    Object.getOwnPropertyDescriptors(patchReflectMethods),
  );
}

/**
 * Currently not exported outside the package.
 * TODO But we should consider exporting it, after removing the `path`
 * parameter.
 *
 * @param {any} val
 * @param {string=} path
 * @returns {boolean}
 */
export const isHardened = (val, path) => {
  if (isPrimitive(val)) {
    return true;
  }
  let answer1;
  let answer2;
  if (ENABLE_POSITIVE_BRANDING) {
    answer1 = hardened.has(val);
  }
  if (ENABLE_NEGATIVE_BRANDING) {
    // We check isFrozen, but we accumulate objects when they become
    // non-extensible, because once non-extensible they might become frozen,
    // and we can more feasibly catch all operations that might make them
    // non-extensible.
    answer2 = isFrozen(val) && !onlyNonExtensible.has(val);
  }
  if (ENABLE_POSITIVE_BRANDING && ENABLE_NEGATIVE_BRANDING) {
    if (answer1 !== answer2) {
      // Not necessarily an error. Might be one of the three safe
      // exceptions explained in the README.md. We should test these
      // outliers, because if it is anything else, we may have a
      // serious bug.
      console.log(`HARDEN disagreement: ${answer1} vs ${answer2} at ${path}`);
    }
  }

  return !!(answer1 && answer2);
};

// TODO curried forEach
// We capture the real WeakSet.prototype.add above, in case someone
// changes it. The two-argument form of forEach passes the second
// argument as the 'this' binding, so we add to the correct set.
export const moreObjectsHardened = toHarden => {
  if (ENABLE_POSITIVE_BRANDING && ENABLE_NEGATIVE_BRANDING) {
    // TODO What consistency check should we put here?
  }
  if (ENABLE_POSITIVE_BRANDING) {
    toHarden.forEach(weakSetAdd, hardened);
  }
  if (ENABLE_NEGATIVE_BRANDING) {
    toHarden.forEach(weakSetDelete, onlyNonExtensible);
  }
};
