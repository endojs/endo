import './lockdown.js'

lockdown({
  consoleTaming: 'unsafe',
  errorTaming: 'unsafe',
  stackFiltering: 'verbose'
})

const compartment = new Compartment()
compartment.globalThis.getThisValue = function () { return this }
const test = () => compartment.evaluate('getThisValue()') === compartment.globalThis

console.log(test()) // false
fixProxyLeak(compartment)
console.log(test()) // true



function fixProxyLeak (compartment) {
  Object.entries(Object.getOwnPropertyDescriptors(compartment.globalThis))
  // for now, for simplicity, apply only to configurable non-getter function values
  .filter(([key, propDesc]) => 'value' in propDesc && typeof propDesc.value === 'function' && propDesc.configurable)
  // redefine with workaround
  .forEach(([key, propDesc]) => {
    const newFn = createFunctionWrapper(propDesc.value, (value) => compartment.__isScopeProxy__(value), compartment.globalThis)
    const newPropDesc = { ...propDesc, value: newFn }
    Reflect.defineProperty(compartment.globalThis, key, newPropDesc)
  })
}

function createFunctionWrapper(sourceValue, unwrapTest, unwrapTo) {
  const newValue = function (...args) {
    if (new.target) {
      // handle constructor calls
      return Reflect.construct(sourceValue, args, new.target)
    } else {
      // handle function calls
      // replace the "this" value if the unwrapTest returns truthy
      const thisRef = unwrapTest(this) ? unwrapTo : this
      return Reflect.apply(sourceValue, thisRef, args)
    }
  }
  Object.defineProperties(newValue, Object.getOwnPropertyDescriptors(sourceValue))
  return newValue
}