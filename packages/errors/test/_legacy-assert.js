/** @type {any} */
const currentAssert = globalThis.assert;

const legacyAssert = (value, optDetails, errConstructor, options) =>
  currentAssert(value, optDetails, errConstructor, options);

for (const [name, value] of Object.entries(currentAssert)) {
  if (name !== 'bare' && name !== 'makeError') {
    legacyAssert[name] = value;
  }
}

Reflect.set(globalThis, 'assert', legacyAssert);
