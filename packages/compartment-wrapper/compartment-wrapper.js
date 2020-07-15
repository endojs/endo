function wrapCompartment(
  oldCompartment,
  inescapableTransforms,
  inescapableGlobalLexicals,
) {
  function newCompartment(endowments, modules, oldOptions) {
    const {
      transforms: oldTransforms = [],
      globalLexicals: oldGlobalLexicals = {},
      ...otherOptions
    } = oldOptions;
    const newTransforms = [...oldTransforms, ...inescapableTransforms];
    const newGlobalLexicals = {
      ...oldGlobalLexicals,
      ...inescapableGlobalLexicals,
    };
    const newOptions = {
      transforms: newTransforms,
      globalLexicals: newGlobalLexicals,
      ...otherOptions,
    };
    let c;
    if (new.target === undefined) {
      // `newCompartment` was called as a function
      c = Reflect.apply(oldCompartment, this, [
        endowments,
        modules,
        newOptions,
      ]);
    } else {
      // It, or a subclass, was called as a constructor
      c = Reflect.construct(
        oldCompartment,
        [endowments, modules, newOptions],
        new.target,
      );
    }
    // console.log(`c is `, c);
    // console.log(`c.globalThis is `, c.globalThis);
    // todo: c.globalThis is undefined
    c.globalThis.Compartment = wrapCompartment(
      c.globalThis.Compartment,
      inescapableTransforms,
      inescapableGlobalLexicals,
    );
    return c;
  }

  return newCompartment;
}

export function inescapableCompartment(oldCompartment, options = {}) {
  const {
    inescapableTransforms = [],
    inescapableGlobalLexicals = {},
    endowments = [],
    modules = [],
    ...compartmentOptions
  } = options;

  const NewCompartment = wrapCompartment(
    oldCompartment,
    inescapableTransforms,
    inescapableGlobalLexicals,
  );
  return new NewCompartment(endowments, modules, compartmentOptions);
}
