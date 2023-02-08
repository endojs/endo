console.log('Attenuator2 imported');

const {
  create,
  assign,
  fromEntries,
  entries,
  defineProperties,
  setPrototypeOf,
} = Object;

// minimal implementation of LavaMoat-style globals attenuator with write propagation
const globalOverrides = create(null);
export const attenuate = (params, originalObject, globalThis) => {
  const policy = params[0];
  console.log('Attenuator2 called', params);
  if (policy === 'root') {
    assign(globalThis, originalObject);
    // This is a slightly naive emulation of LavaMoat's entry compartment behavior.
    // It provides matching functionality with globalThis being frozen after initial attenuation
    // For a more powerful implementation we'd need to make freezing optional.
    setPrototypeOf(globalThis, globalOverrides);
    return;
  }
  defineProperties(
    globalThis,
    fromEntries(
      entries(policy)
        .map(([key, policyValue]) => {
          if (policyValue) {
            const spec = {
              configurable: false,
              enumerable: true,
              get() {
                console.log('- get', key);
                return globalOverrides[key] || originalObject[key];
              },
            };
            if (policyValue === 'write') {
              spec.set = value => {
                console.log('- set', key);
                globalOverrides[key] = value;
              };
            }
            return [key, spec];
          }
          return null;
        })
        .filter(a => a),
    ),
  );
};
