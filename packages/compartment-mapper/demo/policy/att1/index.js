console.log('Attenuator imported');
const attenuate = (params, originalObject) => {
  console.log('Attenuator called', params);
  const ns = params.reduce((acc, k) => {
    acc[k] = originalObject[k];
    return acc;
  }, {});
  return ns;
};

export const attenuateGlobals = attenuate;
export const attenuateModule = attenuate;
