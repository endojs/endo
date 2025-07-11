// Adapted from SES/Caja
// Copyright (C) 2011 Google Inc.

// @ts-check

import {
  Set,
  String,
  TypeError,
  arrayForEach,
  defineProperty,
  getOwnPropertyDescriptor,
  getOwnPropertyDescriptors,
  isPrimitive,
  hasOwn,
  ownKeys,
  setHas,
} from './commons.js';

import {
  minEnablements,
  moderateEnablements,
  severeEnablements,
} from './enablements.js';

/** @import {Reporter} from './reporting-types.js' */

/**
 * For a special set of properties defined in the `enablement` list,
 * `enablePropertyOverrides` ensures that the effect of freezing does not
 * suppress the ability to override these properties on derived objects by
 * simple assignment.
 *
 * Because of lack of sufficient foresight at the time, ES5 unfortunately
 * specified that a simple assignment to a non-existent property must fail if
 * it would override an non-writable data property of the same name in the
 * shadow of the prototype chain. In retrospect, this was a mistake, the
 * so-called "override mistake". But it is now too late and we must live with
 * the consequences.
 *
 * As a result, simply freezing an object to make it tamper proof has the
 * unfortunate side effect of breaking previously correct code that is
 * considered to have followed JS best practices, if this previous code used
 * assignment to override.
 *
 * For the enabled properties, `enablePropertyOverrides` effectively shims what
 * the assignment behavior would have been in the absence of the override
 * mistake. However, the shim produces an imperfect emulation. It shims the
 * behavior by turning these data properties into accessor properties, where
 * the accessor's getter and setter provide the desired behavior. For
 * non-reflective operations, the illusion is perfect. However, reflective
 * operations like `getOwnPropertyDescriptor` see the descriptor of an accessor
 * property rather than the descriptor of a data property. At the time of this
 * writing, this is the best we know how to do.
 *
 * To the getter of the accessor we add a property named
 * `'originalValue'` whose value is, as it says, the value that the
 * data property had before being converted to an accessor property. We add
 * this extra property to the getter for two reason:
 *
 * The harden algorithm walks the own properties reflectively, i.e., with
 * `getOwnPropertyDescriptor` semantics, rather than `[[Get]]` semantics. When
 * it sees an accessor property, it does not invoke the getter. Rather, it
 * proceeds to walk both the getter and setter as part of its transitive
 * traversal. Without this extra property, `enablePropertyOverrides` would have
 * hidden the original data property value from `harden`, which would be bad.
 * Instead, by exposing that value in an own data property on the getter,
 * `harden` finds and walks it anyway.
 *
 * We enable a form of cooperative emulation, giving reflective code an
 * opportunity to cooperate in upholding the illusion. When such cooperative
 * reflective code sees an accessor property, where the accessor's getter
 * has an `originalValue` property, it knows that the getter is
 * alleging that it is the result of the `enablePropertyOverrides` conversion
 * pattern, so it can decide to cooperatively "pretend" that it sees a data
 * property with that value.
 *
 * @param {Record<string, any>} intrinsics
 * @param {'min' | 'moderate' | 'severe'} overrideTaming
 * @param {Reporter} reporter
 * @param {Iterable<string | symbol>} [overrideDebug]
 */
export default function enablePropertyOverrides(
  intrinsics,
  overrideTaming,
  { warn },
  overrideDebug = [],
) {
  const debugProperties = new Set(overrideDebug);
  function enable(path, obj, prop, desc) {
    if ('value' in desc && desc.configurable) {
      const { value } = desc;

      const isDebug = setHas(debugProperties, prop);

      // We use concise method syntax to be `this` sensitive, but still
      // omit a prototype property or [[Construct]] behavior.
      // @ts-expect-error We know there is an accessor descriptor there
      const { get: getter, set: setter } = getOwnPropertyDescriptor(
        {
          get [prop]() {
            return value;
          },
          set [prop](newValue) {
            if (obj === this) {
              throw TypeError(
                `Cannot assign to read only property '${String(
                  prop,
                )}' of '${path}'`,
              );
            }
            if (hasOwn(this, prop)) {
              this[prop] = newValue;
            } else {
              if (isDebug) {
                warn(TypeError(`Override property ${prop}`));
              }
              defineProperty(this, prop, {
                value: newValue,
                writable: true,
                enumerable: true,
                configurable: true,
              });
            }
          },
        },
        prop,
      );

      defineProperty(getter, 'originalValue', {
        value,
        writable: false,
        enumerable: false,
        configurable: false,
      });

      defineProperty(obj, prop, {
        get: getter,
        set: setter,
        enumerable: desc.enumerable,
        configurable: desc.configurable,
      });
    }
  }

  function enableProperty(path, obj, prop) {
    const desc = getOwnPropertyDescriptor(obj, prop);
    if (!desc) {
      return;
    }
    enable(path, obj, prop, desc);
  }

  function enableAllProperties(path, obj) {
    const descs = getOwnPropertyDescriptors(obj);
    if (!descs) {
      return;
    }
    // TypeScript does not allow symbols to be used as indexes because it
    // cannot recokon types of symbolized properties.
    arrayForEach(ownKeys(descs), prop => enable(path, obj, prop, descs[prop]));
  }

  function enableProperties(path, obj, plan) {
    for (const prop of ownKeys(plan)) {
      const desc = getOwnPropertyDescriptor(obj, prop);
      if (!desc || desc.get || desc.set) {
        // No not a value property, nothing to do.
        // eslint-disable-next-line no-continue
        continue;
      }

      // In case `prop` is a symbol, we first coerce it with `String`,
      // purely for diagnostic purposes.
      const subPath = `${path}.${String(prop)}`;
      const subPlan = plan[prop];

      if (subPlan === true) {
        enableProperty(subPath, obj, prop);
      } else if (subPlan === '*') {
        enableAllProperties(subPath, desc.value);
      } else if (!isPrimitive(subPlan)) {
        enableProperties(subPath, desc.value, subPlan);
      } else {
        throw TypeError(`Unexpected override enablement plan ${subPath}`);
      }
    }
  }

  let plan;
  switch (overrideTaming) {
    case 'min': {
      plan = minEnablements;
      break;
    }
    case 'moderate': {
      plan = moderateEnablements;
      break;
    }
    case 'severe': {
      plan = severeEnablements;
      break;
    }
    default: {
      throw TypeError(`unrecognized overrideTaming ${overrideTaming}`);
    }
  }

  // Do the repair.
  enableProperties('root', intrinsics, plan);
}
