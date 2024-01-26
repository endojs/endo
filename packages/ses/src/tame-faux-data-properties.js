import {
  getOwnPropertyDescriptor,
  apply,
  defineProperty,
  toStringTagSymbol,
} from './commons.js';

const throws = thunk => {
  try {
    thunk();
    return false;
  } catch (er) {
    return true;
  }
};

/**
 * Exported for convenience of unit testing. Harmless, but not expected
 * to be useful by itself.
 *
 * @param {any} obj
 * @param {string|symbol} prop
 * @param {any} expectedValue
 * @returns {boolean}
 * Returns whether `tameFauxDataProperty` turned the property in question
 * from an apparent faux data property into the actual data property it
 * seemed to emulate.
 * If this function returns `false`, then we hope no effects happened.
 * However, sniffing out if an accessor property seems to be a faux data
 * property requires invoking the getter and setter functions that might
 * possibly have side effects.
 * `tameFauxDataProperty` is not in a position to tell.
 */
export const tameFauxDataProperty = (obj, prop, expectedValue) => {
  if (obj === undefined) {
    // The object does not exist in this version of the platform
    return false;
  }
  const desc = getOwnPropertyDescriptor(obj, prop);
  if (!desc || 'value' in desc) {
    // The property either doesn't exist, or is already an actual data property.
    return false;
  }
  const { get, set } = desc;
  if (typeof get !== 'function' || typeof set !== 'function') {
    // A faux data property has both a getter and a setter
    return false;
  }
  if (get() !== expectedValue) {
    // The getter called by itself should produce the expectedValue
    return false;
  }
  if (apply(get, obj, []) !== expectedValue) {
    // The getter called with `this === obj` should also return the
    // expectedValue.
    return false;
  }
  const testValue = 'Seems to be a setter';
  const subject1 = { __proto__: null };
  apply(set, subject1, [testValue]);
  if (subject1[prop] !== testValue) {
    // The setter called with an unrelated object as `this` should
    // set the property on the object.
    return false;
  }
  const subject2 = { __proto__: obj };
  apply(set, subject2, [testValue]);
  if (subject2[prop] !== testValue) {
    // The setter called on an object that inherits from `obj` should
    // override the property from `obj` as if by assignment.
    return false;
  }
  if (!throws(() => apply(set, obj, [expectedValue]))) {
    // The setter called with `this === obj` should throw without having
    // caused any effect.
    // This is the test that has the greatest danger of leaving behind some
    // persistent side effect. The most obvious one is to emulate a
    // successful assignment to the property. That's why this test
    // uses `expectedValue`, so that case is likely not to actually
    // change anything.
    return false;
  }
  if ('originalValue' in get) {
    // The ses-shim uniquely, as far as we know, puts an `originalValue`
    // property on the getter, so that reflect property tranversal algorithms,
    // like `harden`, will traverse into the enulated value without
    // calling the getter. That does not happen until `permits-intrinsics.js`
    // which is much later. So if we see one this early, we should
    // not assume we understand what's going on.
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
  // via accessor functions that SES controls, so we know what they are
  // doing. In addition, the getter functions installed by
  // `enable-property-overrides.js` have an `originalValue` field
  // enabling meta-traversal code like harden to visit the original value
  // without calling the getter.

  if (desc.configurable === false) {
    // Even though it seems to be a faux data property, we're unable to fix it.
    return false;
  }

  // Many of the `return false;` cases above plausibly should be turned into
  // errors, or an least generate warnings. However, for those, the checks
  // following this phase are likely to signal an error anyway.

  // At this point, we have passed all our sniff checks for validating that
  // it seems to be a faux data property with the expected value. Turn
  // it into the actual data property it emulates, but writable so there is
  // not yet an override mistake problem.

  defineProperty(obj, prop, {
    value: expectedValue,
    writable: true,
    enumerable: desc.enumerable,
    configurable: true,
  });

  return true;
};

/**
 * In JavaScript, the so-called "override mistake" is the inability to
 * override an inherited non-writable data property by assignment. A common
 * workaround is to instead define an accessor property that acts like
 * a non-writable data property, except that it allows an object that
 * inherits this property to override it by assignment. Let's call
 * an access property that acts this way a "faux data property". In this
 * ses-shim, `enable-property-overrides.js` makes the properties listed in
 * `enablements.js` into faux data properties.
 *
 * But the ses-shim is not alone in use of this trick. Starting with the
 * [Iterator Helpers proposal](https://github.com/tc39/proposal-iterator-helpers),
 * some properties are defined as (what we call) faux data properties.
 * Some of these are new properties (`Interator.prototype.constructor`) and
 * some are old data properties converted to accessor properties
 * (`Iterator.prototype[String.toStringTag]`). So the ses-shim needs to be
 * prepared for some enumerated set of properties to already be faux data
 * properties in the platform prior to our initialization.
 *
 * For these possible faux data properties, it is important that
 * `permits.js` describe each as a data property, so that it can further
 * constrain the apparent value (that allegedly would be returned by the
 * getter) according to its own permits.
 *
 * However, at the time of this writing, the precise behavior specified
 * by the iterator-helpers proposal for these faux data properties is
 * novel. We should not be too confident that all further such platform
 * additions do what we would now expect. So, for each of these possible
 * faux data properties, we do some sniffing to see if it behaves as we
 * currently expect a faux data property to act. If not, then
 * `tameFauxDataProperties` tries not to modify it, leaving it to later
 * checks, especially `permits-intrinsics.js`, to error when it sees an
 * unexpected accessor.
 *
 * If one of these enumerated accessor properties does seem to be
 * a faithful faux data property, then `tameFauxDataProperties` itself
 * *tempoarily* turns it into the actual data property that it seems to emulate.
 * This data property starts as writable, so that in this state it will
 * not trigger the override mistake, i.e., assignment to an object inheriting
 * this property is allowed to succeed at overriding this property.
 *
 * For those properties that should be a faux data property rather than an
 * actual one, such as those from the iterator-helpers proposal,
 * they should be listed as such in `enablements.js`, so
 * `enable-property-overrides.js` will turn it back into a faux data property.
 * But one controlled by the ses-shim, whose behavior we understand.
 *
 * `tameFauxDataProperties`, which turns these into actual data properties,
 * happens during the `repairIntrinsics` phase
 * of `lockdown`, before even vetted shim are supposed to run.
 * `enable-property-overrides.js` runs after vetted shims, turning the
 * appropriate ones back into faux data properties. Thus vetted shims
 * can observe the possibly non-conforming state where these are temporarily
 * actual data properties, rather than faux data properties.
 *
 * Coordinate the property enumeration here
 * with `enablements.js`, so the appropriate properties are
 * turned back to faux data properties.
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
