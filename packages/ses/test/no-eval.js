/* global globalThis */
/* eslint-disable no-proto,func-names,no-empty-function,no-extend-native */

// This is a fixture for test-no-eval.js which ensures that eval is unusable at
// the time of SES initialization.

// eslint-disable-next-line no-eval
globalThis.eval = _source => {
  throw new TypeError('no unsafe-eval, as if by content-security-policy');
};

const functionPrototype = Function.prototype;
const functionConstructor = _source => {
  throw new TypeError('no unsafe-eval, as if by content-security-policy');
};
functionConstructor.prototype = functionPrototype;
globalThis.Function = functionConstructor;
Object.defineProperty(Function.prototype, 'constructor', {
  value: functionConstructor,
  writable: false,
  configurable: true,
});

for (const f of [function*() {}, async function() {}, async function*() {}]) {
  const constructor = _source => {
    throw new TypeError('no unsafe-eval, as if by content-security-policy');
  };
  constructor.__proto__ = functionConstructor;
  const prototype = f.__proto__;
  constructor.prototype = prototype;
  Object.defineProperty(prototype, 'constructor', {
    value: constructor,
    writable: false,
    configurable: true,
  });
}
