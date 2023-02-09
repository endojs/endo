console.log('Attenuator2 imported');

const { create, assign, fromEntries, entries, defineProperties } = Object;

// minimal implementation of LavaMoat-style globals attenuator with write propagation
let globalOverrides = create(null);
export const attenuate = (params, originalObject, globalThis) => {
  const policy = params[0];
  console.log('Attenuator2 called', params);
  if (policy === 'root') {
    assign(globalThis, originalObject);
    // This assumes that the root compartment is the first to be attenuated
    globalOverrides = globalThis;
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
