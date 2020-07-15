function wrapCompartment(oldCompartment, inescapableTransforms, inescapableGlobalLexicals) {
  // todo: let this be called as `new newCompartment(..)`
  function newCompartment(endowments, modules, oldOptions) {
    const {
      transforms: oldTransforms = [],
      globalLexicals: oldGlobalLexicals = {},
      ...otherOptions,
    } = oldOptions;
    const newTransforms = [...oldTransforms, ...inescapableTransforms];
    const newGlobalLexicals = { ...oldGlobalLexicals, ...inescapableGlobalLexicals };
    const newOptions = {
      transforms: newTransforms,
      globalLexicals: newGlobalLexicals,
      ...otherOptions,
    };
    const c = new oldCompartment(endowments, modules, newOptions);
    c.globalThis.Compartment = wrapCompartment(c.globalThis.Compartment,
                                               inescapableTransforms,
                                               inescapableGlobalLexicals);
    return c;
  }

  return newCompartment;
}

export function inescapableCompartment(oldCompartment, options={}) {
  const {
    inescapableTransforms = [],
    inescapableGlobalLexicals = {},
    endowments = [],
    modules = [],
    ...compartmentOptions,
  } = options;

  const newCompartment = wrapCompartment(oldCompartment, inescapableTransforms, inescapableGlobalLexicals);
  return new newCompartment(endowments, modules, compartmentOptions);
}
