/**
 * @fileoverview Exports {@code ses.dataPropertiesToRepair}, a recursively
 * defined JSON record enumerating the optimal set of prototype properties
 * on primordials that need to be repaired before hardening.
 *
 * //provides ses.dataPropertiesToRepair
 * @author JF Paradis
 */

/**
 * <p>The optimal set of prototype properties that need to be repaired
 * before hardening is applied on enviromments subject to the override
 * mistake.
 *
 * <p>Because "repairing" replaces data properties with accessors, every
 * time a repaired property is accessed, the associated getter is invoked,
 * which degrades the runtime performance of all code executing in a
 * the repaired enviromment, compared to the non-repaired case. In order
 * to maintain performance, we only repair the properties of objects
 * for which hardening causes a breakage of their intended usage. There
 * are two cases:
 * <ul>Overriding properties on objects typically used as maps,
 *     namely {@code "Object"} and {@code "Array"}. In the case of arrays,
 *     a given program might not be aware that non-numerical properties are
 *     stored on the undelying object instance, not on the array. When an
 *     object is typically used as a map, we repair all of its prototype
 *     properties.
 * <ul>Overriding properties on objects that provide defaults on their
 *     prototype that programs typically override by assignment, such as
 *     {@code "Error.prototype.message"} and {@code "Function.prototype.name"}
 *     (both default to "").
 *
 * <p>Each JSON record enumerates the disposition of the properties on
 * some corresponding primordial object, with the root record containing:
 * <ul>
 * <li>The record for the global object.
 * <li>The record for the anonymous intrinsics.
 * </ul>
 *
 * <p>For each such record, the values associated with its property
 * names can be:
 * <ul>
 * <li>Another record, in which case this property is simply left
 *     unrepaired and that next record represents the disposition of
 *     the object which is its value. For example, {@code "Object"}
 *     leads to another record explaining what properties {@code
 *     "Object"} may have and how each such property, if present,
 *     and its value should be repaired.
 * <li>true, in which case this property is simply repaired. The
 *     value associated with that property is not traversed. For
 * 	   example, {@code "Function.prototype.name"} leads to true,
 *     meaning that the {@code "name"} property of {@code
 *     "Function.prototype"} should be repaired. If the property is
 *     already an accessor property, it is not repaired (because
 *     accessors are not subject to the override mistake).
 * <li>"*", all properties on this object are repaired.
 * </ul>
 *
 * <p>We factor out {@code true} into the variable {@code t} just to
 * get a bit better compression from simple minifiers.
 */

const t = true;

export default {
  global: {
    Object: {
      prototype: '*',
    },

    Array: {
      prototype: '*',
    },

    Function: {
      prototype: {
        name: t,
        toString: t,
      },
    },

    Error: {
      prototype: {
        message: t,
      },
    },
  },

  anonIntrinsics: {
    TypedArray: {
      prototype: '*',
    },

    GeneratorFunction: {
      prototype: {
        name: t,
        toString: t,
      },
    },

    AsyncFunction: {
      prototype: {
        name: t,
        toString: t,
      },
    },

    AsyncGeneratorFunction: {
      prototype: {
        name: t,
        toString: t,
      },
    },

    IteratorPrototype: '*',
  },
};
