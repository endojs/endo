console.log('@enuator imported');
export const attenuate = (params, originalModuleNamespace) => {
  console.log('@enuator called', params);
  // Object.assign(exportsProxy, originalModuleNamespace);
  const ns = params.reduce((acc, k) => {
    acc[k] = originalModuleNamespace[k];
    return acc;
  }, {});
  return ns;
};
