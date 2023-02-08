console.log('Attenuator imported');
export const attenuate = (params, originalObject) => {
  console.log('Attenuator called', params);
  const ns = params.reduce((acc, k) => {
    acc[k] = originalObject[k];
    return acc;
  }, {});
  return ns;
};
