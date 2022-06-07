export const importReal = async (
  moduleNames,
  containerName = 'external-modules',
) => {
  const realModules = {};

  const coreModulesCompartment = new Compartment(
    {},
    {},
    {
      name: containerName,
      resolveHook: moduleSpecifier => {
        return moduleSpecifier;
      },
      importHook: async moduleSpecifier => {
        const ns =
          realModules[moduleSpecifier].default || realModules[moduleSpecifier];

        const staticModuleRecord = Object.freeze({
          imports: [],
          exports: Object.keys(ns),
          execute: moduleExports => {
            Object.assign(moduleExports, ns);
            moduleExports.default = ns;
          },
        });
        return staticModuleRecord;
      },
    },
  );

  await Promise.all(
    moduleNames
      .map(async name => {
        realModules[name] = await import(name);
      })
  );

  return Object.fromEntries(
    await Promise.all(
      Object.keys(realModules).map(async name => [
        name,
        (await coreModulesCompartment.import(name)).namespace,
      ]),
    ),
  );
};
