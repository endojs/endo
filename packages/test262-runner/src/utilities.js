const {
  getOwnPropertyDescriptor,
  getOwnPropertyDescriptors,
  defineProperty,
  defineProperties,
} = Object;

export function applyCorrections({ sourceTextCorrections = [] }, src) {
  for (const correction of sourceTextCorrections) {
    src = src.replace(...correction);
  }
  return src;
}

export function captureGlobals({ captureGlobalObjectNames = [] }) {
  const capture = {};

  for (const name of captureGlobalObjectNames) {
    capture[name] = {};
    capture[name].global = getOwnPropertyDescriptor(globalThis, name);
    capture[name].static = getOwnPropertyDescriptors(globalThis[name]);
    if (globalThis[name].prototype) {
      capture[name].proto = getOwnPropertyDescriptors(
        globalThis[name].prototype,
      );
    }
  }

  function restoreGlobals() {
    for (const name of captureGlobalObjectNames) {
      defineProperty(globalThis, name, capture[name].global);
      defineProperties(globalThis[name], capture[name].static);
      if (capture[name].proto)
        defineProperties(globalThis[name].prototype, capture[name].proto);
    }
  }

  return restoreGlobals;
}
