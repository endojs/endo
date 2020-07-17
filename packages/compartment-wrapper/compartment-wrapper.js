const wrappedCompartments = new WeakSet();

function wrapCompartment(
  OldCompartment,
  inescapableTransforms,
  inescapableGlobalLexicals,
) {
  // This is the new Compartment constructor. We name it `Compartment` so
  // that it's .name property is correct, but we hold it in 'NewCompartment'
  // so that lint doesn't think we're shadowing the original.
  const NewCompartment = function Compartment(
    endowments,
    modules,
    oldOptions = {},
  ) {
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
      ...otherOptions,
      transforms: newTransforms,
      globalLexicals: newGlobalLexicals,
    };

    // The real Compartment is defined as a class, so 'new Compartment()'
    // works but not 'Compartment()'. We can behave the same way. It would be
    // nice to delegate the 'throw' to the original constructor by knowing
    // calling it the wrong way, but I don't know how to do that.
    if (new.target === undefined) {
      // `newCompartment` was called as a function
      throw Error('Compartment must be called as a constructor');
    }

    // It, or a subclass, was called as a constructor
      
    const c = Reflect.construct(OldCompartment, [endowments, modules, newOptions],
                                new.target);

    // replace the child's Compartment with a wrapped version that enforces
    // the same options
    if (!wrappedCompartments.has(c.globalThis.Compartment)) {
      c.globalThis.Compartment = wrapCompartment(
        c.globalThis.Compartment,
        inescapableTransforms,
        inescapableGlobalLexicals,
      );
      wrappedCompartments.add(c.globalThis.Compartment);
    }
    return c;
  };
  NewCompartment.prototype = OldCompartment.prototype;

  // SECURITY NOTE: this will probably leave c.prototype.constructor pointing
  // at the original (untamed) Compartment, which would allow a breach. Kris
  // says this will be hard to fix until he rewrites the compartment shim,
  // possibly as a plain function instead of a class.
  // ACTUALLY, under SES, OldCompartment.prototype.constructor is tamed

  return NewCompartment;
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
