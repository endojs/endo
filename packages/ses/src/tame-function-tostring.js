import {
  WeakSet,
  defineProperty,
  freeze,
  functionPrototype,
  functionToString,
  printHermes,
  stringEndsWith,
  weaksetAdd,
  weaksetHas,
} from './commons.js';

const nativeSuffix = ') { [native code] }';

// Note: Top level mutable state. Does not make anything worse, since the
// patching of `Function.prototype.toString` is also globally stateful. We
// use this top level state so that multiple calls to `tameFunctionToString` are
// idempotent, rather than creating redundant indirections.
let repairVirtualizedNativeFunction;

/**
 * Replace `Function.prototype.toString` with one that recognizes
 * shimmed functions as honorary native functions.
 */
export const tameFunctionToString = () => {
  printHermes('SES: tameFunctionToString'); // lockdown,compartment shim
  if (repairVirtualizedNativeFunction === undefined) {
    const virtualizedNativeFunctions = new WeakSet();
    const repairedNativeFunctions = new WeakSet();

    const tamingMethods = {
      toString() {
        const str = functionToString(this);
        if (
          stringEndsWith(str, nativeSuffix) ||
          !weaksetHas(virtualizedNativeFunctions, this)
        ) {
          return str;
        }
        return `function ${this.name}() { [native code] }`;
      },
    };

    defineProperty(functionPrototype, 'toString', {
      value: tamingMethods.toString,
    });

    printHermes(`functionPrototype: ${functionPrototype}`);

    repairVirtualizedNativeFunction = freeze(func => {
      try {
        printHermes(`func.prototype: ${func.prototype}`);
      } catch (error) {
        printHermes(`❌ func.prototype: ${error}`);
      }
      printHermes(`func: ${func}`);
      if (
        !weaksetHas(repairedNativeFunctions, func) &&
        // eslint-disable-next-line @endo/no-polymorphic-call
        !/^[A-Z]/.test(func.name) &&
        func.prototype !== undefined
      ) {
        printHermes(`Setting prototype to undefined on ${func}`);
        // delete func.prototype;
        // defineProperty(func, 'prototype', {
        //   value: undefined,
        // });
        func.prototype = undefined;
      }
      weaksetAdd(repairedNativeFunctions, func);
      return weaksetAdd(virtualizedNativeFunctions, func);
    });
  }
  return repairVirtualizedNativeFunction;
};
