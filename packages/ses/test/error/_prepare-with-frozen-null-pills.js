import '../../index.js';

// Plant own, undeletable `arguments` and `caller` properties on an intrinsic
// function that lockdown's property removal visits, imitating the poison
// pills that Chromium's V8 (through at least 133, as shipped in the Android
// System WebView) puts on every Web IDL function.
//
// The shape is chosen by `globalThis.pillShape`, or by the first command-line
// argument when run as a child process:
// - 'frozen-null': non-writable, non-configurable `null` (tolerated)
// - 'frozen-zero': non-writable, non-configurable `0` (must still fail)
// - 'writable-null': writable, non-configurable `null` (must still fail)

const { defineProperties } = Object;
const { apply } = Reflect;

const pillShape =
  globalThis.pillShape ||
  (typeof process !== 'undefined' && process.argv[2]) ||
  'frozen-null';

const pillDescriptors = {
  'frozen-null': { value: null, writable: false },
  'frozen-zero': { value: 0, writable: false },
  'writable-null': { value: null, writable: true },
};
const pillDescriptor = pillDescriptors[pillShape];
if (pillDescriptor === undefined) {
  throw Error(`unknown pill shape ${pillShape}`);
}

const originalIsArray = Array.isArray;

// An arrow function has no own `arguments` or `caller`, so these
// definitions add them, like the engine does.
const isArrayWithPills = (...args) => apply(originalIsArray, Array, args);
defineProperties(isArrayWithPills, {
  arguments: { ...pillDescriptor, enumerable: false, configurable: false },
  caller: { ...pillDescriptor, enumerable: false, configurable: false },
});

defineProperties(Array, {
  isArray: { value: isArrayWithPills },
});
