export const makeImportMetaHook = (compartment, moduleLocation) => {
  return {
    resolve: (specifier) => compartment.resolve(specifier, moduleLocation),
  };
};
