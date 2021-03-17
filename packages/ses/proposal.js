import './lockdown.js';

lockdown({
  consoleTaming: 'unsafe',
  errorTaming: 'unsafe',
  stackFiltering: 'verbose',
});

function createFunctionWrapper(sourceValue, unwrapTest, unwrapTo) {
  const newValue = function(...args) {
    if (new.target) {
      // handle constructor calls
      return Reflect.construct(sourceValue, args, new.target);
    } else {
      // handle function calls
      // replace the "this" value if the unwrapTest returns truthy
      const thisRef = unwrapTest(this) ? unwrapTo : this;
      return Reflect.apply(sourceValue, thisRef, args);
    }
  };
  Object.defineProperties(
    newValue,
    Object.getOwnPropertyDescriptors(sourceValue),
  );
  return newValue;
}

function fixProxyLeak(compartment) {
  Object.entries(Object.getOwnPropertyDescriptors(compartment.globalThis))
    // for now, for simplicity, apply only to configurable non-getter function values
    .filter(
      ([_, propDesc]) =>
        'value' in propDesc &&
        typeof propDesc.value === 'function' &&
        propDesc.configurable,
    )
    // redefine with workaround
    .forEach(([key, propDesc]) => {
      const newFn = createFunctionWrapper(
        propDesc.value,
        /* eslint-disable-next-line no-underscore-dangle */
        value => compartment.__isScopeProxy__(value),
        compartment.globalThis,
      );
      const newPropDesc = { ...propDesc, value: newFn };
      Reflect.defineProperty(compartment.globalThis, key, newPropDesc);
    });
}

const packageCompartment = new Compartment();
packageCompartment.globalThis.getThisValue = function() {
  return this;
};
const test = () =>
  packageCompartment.evaluate('getThisValue()') ===
  packageCompartment.globalThis;

console.log(test()); // false
fixProxyLeak(packageCompartment);
console.log(test()); // true
