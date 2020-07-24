import { defineProperty, apply } from './commons.js';

const nativeSuffix = ') { [native code] }';

export function tameFunctionToString() {
  const nativeBrand = new WeakSet();

  const originalFunctionToString = Function.prototype.toString;

  const tamingMethods = {
    toString() {
      const str = apply(originalFunctionToString, this, []);
      if (str.endsWith(nativeSuffix) || !nativeBrand.has(this)) {
        return str;
      }
      return `function ${this.name}() { [native code] }`;
    },
  };

  defineProperty(Function.prototype, 'toString', {
    value: tamingMethods.toString,
  });

  return func => nativeBrand.add(func);
}
