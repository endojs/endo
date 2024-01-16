import {
  getOwnPropertyDescriptor,
  apply,
  defineProperty,
  toStringTagSymbol,
} from './commons.js';

const throws = thunk => {
  try {
    thunk();
  } catch (er) {
    return true;
  }
  return false;
};

/**
 * Exported for convenience of unit testing. Harmless, but not expected
 * to be useful by itself.
 *
 * @param {any} obj
 * @param {string|symbol} prop
 * @param {any} expectedValue
 * @returns {boolean}
 */
export const tameFauxDataProperty = (obj, prop, expectedValue) => {
  if (obj === undefined) {
    return false;
  }
  const desc = getOwnPropertyDescriptor(obj, prop);
  if (!desc || 'value' in desc) {
    return false;
  }
  const { get, set } = desc;
  if (typeof get !== 'function') {
    return false;
  }
  if (typeof set !== 'function') {
    return false;
  }
  const observedValue = get();
  if (observedValue !== expectedValue) {
    return false;
  }
  if (apply(get, obj, []) !== expectedValue) {
    return false;
  }
  const testValue = 'Seems to be a setter';
  const subject1 = { __proto__: null };
  apply(set, subject1, [testValue]);
  if (subject1[prop] !== testValue) {
    return false;
  }
  const subject2 = { __proto__: obj };
  apply(set, subject2, [testValue]);
  if (subject2[prop] !== testValue) {
    return false;
  }
  if (!throws(() => apply(set, obj, [testValue]))) {
    return false;
  }
  if ('originalValue' in get) {
    return false;
  }

  // We assume that this code runs before any untrusted code runs, so
  // we do not need to worry about the above conditions passing because of
  // malicious intent. In fact, it runs even before vetted shims are supposed
  // to run, between repair and hardening. Given that, after all these tests
  // pass, we have adequately validated that the property in question is
  // an accessor function whose purpose is suppressing the override mistake,
  // i.e., enabling a non-writable property to be overridden by assignment.
  // In that case, here we *temporarily* turn it into the data property
  // it seems to emulate, but writable so that it does not trigger the
  // override mistake while in this temporary state.

  // For those properties that are also listed in `enablements.js`,
  // that phase will re-enable override for these properties, but
  // via accessor functions that ses controls, so we know what they are
  // doing. In addition, the getter functions installed by
  // `enable-property-overrides.js` have an `originalValue` field
  // enabling meta-traversal code like harden to visit the original value
  // without calling the getter.

  if (desc.configurable === false) {
    // Even though it seems to be an accessor, we're unable to fix it.
    return false;
  }

  // Many of the `return false;` cases above plausibly should be turned into
  // errors, or an least generate warnings. However, for those, the checks
  // following this phase are likely to signal an error anyway.

  defineProperty(obj, prop, {
    value: expectedValue,
    writable: true,
    enumerable: desc.enumerable,
    configurable: true,
  });

  return true;
};

/**
 * For each, see it the property is an accessor property that
 * seems to emulate a data property with this expectedValue,
 * and seems to be an accessor whose purpose is to protect against
 * the override mistake, i.e., enable these properties to be overridden
 * by assignment. If all these expected conditions are met, then
 * *temporarily* turn it into the data property it emulated.
 *
 * Coordinate with `enablements.js` so the appropriate ones are
 * turned back to accessor that protect against override mistake,
 * but accessors we know.
 *
 * @param {Record<any,any>} intrinsics
 */
export const tameFauxDataProperties = intrinsics => {
  // https://github.com/tc39/proposal-iterator-helpers
  tameFauxDataProperty(
    intrinsics['%IteratorPrototype%'],
    'constructor',
    intrinsics.Iterator,
  );
  // https://github.com/tc39/proposal-iterator-helpers
  tameFauxDataProperty(
    intrinsics['%IteratorPrototype%'],
    toStringTagSymbol,
    'Iterator',
  );
};
