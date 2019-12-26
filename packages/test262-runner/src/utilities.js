export function applyCorrections({ sourceTextCorrections = [] }, src) {
  for (const correction of sourceTextCorrections) {
    src = src.replace(...correction);
  }
  return src;
}

export function captureGlobals({ captureGlobalObjectNames }) {
  const capture = {};
  
  for (const name of captureGlobalObjectNames) {
    capture[name] = {
      global: Object.getOwnPropertyDescriptor(globalThis, name),
      static: Object.getOwnPropertyDescriptors(globalThis[name]),
      proto: Object.getOwnPropertyDescriptors(globalThis[name]['prototype']),
    };
  }

  function restoreGlobals() {
    for (const name of captureGlobalObjectNames) {
      Object.defineProperty(globalThis, name, capture[name].global);
      Object.defineProperties(globalThis[name], capture[name].static);
      Object.defineProperties(globalThis[name]['prototype'], capture[name].proto);
    }
  }

  return restoreGlobals;
}
