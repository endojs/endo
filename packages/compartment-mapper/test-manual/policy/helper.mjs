const rawModules = {};

const synteticModulesCompartment = new Compartment(
  {},
  {},
  {
    name: 'synteticModules',
    resolveHook: moduleSpecifier => moduleSpecifier,
    importHook: async moduleSpecifier => {
      const ns =
        rawModules[moduleSpecifier].default || rawModules[moduleSpecifier];

      const staticModuleRecord = Object.freeze({
        imports: [],
        exports: Array.from(new Set(Object.keys(ns).concat(['default']))),
        execute: moduleExports => {
          Object.assign(moduleExports, ns);
          moduleExports.default = ns;
        },
      });
      return staticModuleRecord;
    },
  },
);

export const addToCompartment = async (name, nsObject) => {
  rawModules[name] = nsObject;
  return (await synteticModulesCompartment.import(name)).namespace;
};
