// Adapted from SES/Caja
// Copyright (C) 2011 Google Inc.
// https://github.com/google/caja/blob/master/src/com/google/caja/ses/startSES.js
// https://github.com/google/caja/blob/master/src/com/google/caja/ses/repairES5.js
import enablements from './enablements.js';

const {
  defineProperties,
  getOwnPropertyNames,
  getOwnPropertyDescriptor,
  getOwnPropertyDescriptors,
} = Object;

const { ownKeys } = Reflect;

function isObject(obj) {
  return obj !== null && typeof obj === 'object';
}

/**
 * For a special set of properties (defined in the enablement plan), it ensures
 * that the effect of freezing does not suppress the ability to override
 * these properties on derived objects by simple assignment.
 *
 * Because of lack of sufficient foresight at the time, ES5 unfortunately
 * specified that a simple assignment to a non-existent property must fail if
 * it would override a non-writable data property of the same name. (In
 * retrospect, this was a mistake, but it is now too late and we must live
 * with the consequences.) As a result, simply freezing an object to make it
 * tamper proof has the unfortunate side effect of breaking previously correct
 * code that is considered to have followed JS best practices, if this
 * previous code used assignment to override.
 */
export default function enablePropertyOverrides(intrinsics, options = {}) {
  const { initialFreeze } = options;

  function enable(path, obj, prop, desc) {
    if ('value' in desc && desc.configurable) {
      const { value } = desc;

      // eslint-disable-next-line no-inner-declarations
      function getter() {
        return value;
      }

      if (initialFreeze) {
        initialFreeze.push(value);
      } else {
        // Re-attach the data property on the object so
        // it can be found by the deep-freeze traversal process.
        getter.value = value;
      }

      // eslint-disable-next-line no-inner-declarations
      function setter(newValue) {
        if (obj === this) {
          throw new TypeError(
            `Cannot assign to read only property '${prop}' of '${path}'`,
          );
        }
        if (hasOwnProperty.call(this, prop)) {
          this[prop] = newValue;
        } else {
          defineProperties(this, {
            [prop]: {
              value: newValue,
              writable: true,
              enumerable: desc.enumerable,
              configurable: desc.configurable,
            },
          });
        }
      }

      defineProperties(obj, {
        [prop]: {
          get: getter,
          set: setter,
          enumerable: desc.enumerable,
          configurable: desc.configurable,
        },
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
    ownKeys(descs).forEach(prop => enable(path, obj, prop, descs[prop]));
  }

  function enableProperties(path, obj, plan) {
    for (const prop of getOwnPropertyNames(plan)) {
      const desc = getOwnPropertyDescriptor(obj, prop);
      if (!desc || desc.get || desc.set) {
        // No not a value property, nothing to do.
        // eslint-disable-next-line no-continue
        continue;
      }

      // Plan has no symbol keys and we use getOwnPropertyNames()
      // to avoid issues with stringification of property name.
      const subPath = `${path}.${prop}`;
      const subPlan = plan[prop];

      switch (subPlan) {
        case true:
          enableProperty(subPath, obj, prop);
          break;

        case '*':
          enableAllProperties(subPath, desc.value);
          break;

        default:
          if (isObject(subPlan)) {
            enableProperties(subPath, desc.value, subPlan);
            break;
          }
          throw new TypeError(`Unexpected override enablement plan ${subPath}`);
      }
    }
  }

  // Do the repair.
  enableProperties('root', intrinsics, enablements);
}
