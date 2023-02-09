console.log('Attenuator imported');
export const attenuate = (params, originalModuleNamespace) => {
  console.log('Attenuator called', params);
  const ns = params.reduce((acc, k) => {
    acc[k] = originalModuleNamespace[k];
    return acc;
  }, {});
  return ns;
};
