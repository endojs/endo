export function wrapInescapableCompartment(
  OldCompartment,
  inescapableTransforms,
  inescapableGlobalProperties,
) {
  // This is the new Compartment constructor. We name it `Compartment` so
  // that it's .name property is correct, but we hold it in 'NewCompartment'
  // so that lint doesn't think we're shadowing the original.
  const NewCompartment = function Compartment(
    endowments,
    modules,
    oldOptions = {},
  ) {
    const { transforms: oldTransforms = [], ...otherOptions } = oldOptions;
    const newTransforms = [...oldTransforms, ...inescapableTransforms];
    const newOptions = {
      ...otherOptions,
      transforms: newTransforms,
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

    const c = Reflect.construct(
      OldCompartment,
      [endowments, modules, newOptions],
      new.target,
    );
    // The confinement applies to all compartments too. This relies upon the
    // child's normal Compartment behaving the same way as the parent's,
    // which will cease to be the case soon (their module tables are
    // different). TODO: update this when that happens, we need something
    // like c.globalThis.Compartment = wrap(c.globalThis.Compartment), but
    // there are details to work out.
    c.globalThis.Compartment = NewCompartment;

    // Use Reflect.ownKeys, not Object.keys, because we want both
    // string-named and symbol-named properties. Note that
    // Reflect.ownKeys also includes non-enumerable keys.
    // This differs from the longer term agreement discussed at
    // https://www.youtube.com/watch?v=xlR21uDigGE in these ways:
    // - The option in question should be named `inescapableGlobals` since
    //   we want to reserve `*Properties` for descriptor copying rather
    //   than value copying.
    // - We don't plan to support such `*Properties` options at this time.
    //   Rather, we should deprecate (and eventually remove) this one
    //   once we introduce`inescapableGlobals`.
    // - We plan to move these options to the `Compartment` constructor itself,
    //   in which case their support in import-bundle will just forward
    //   to `Compartment`.
    // - Following the `assign`-like semantics agree on in that meeting,
    //   this should only copy enumerable own properties, whereas the loop
    //   below copies all own properties.
    // The loop here does follow this agreement by differing from `assign` in
    // making all the target properties non-enumerable. The agreement would
    // further align the normal `Compartment` endowments argument to also
    // make the target properties non-enumerable.
    for (const prop of Reflect.ownKeys(inescapableGlobalProperties)) {
      Object.defineProperty(c.globalThis, prop, {
        value: inescapableGlobalProperties[prop],
        writable: true,
        // properties of globalThis are generally non-enumerable
        enumerable: false,
        configurable: true,
      });
    }

    return c;
  };

  // ensure `(c isinstance Compartment)` remains true
  NewCompartment.prototype = OldCompartment.prototype;

  // SECURITY NOTE: if this were used outside of SES, this might leave
  // c.prototype.constructor pointing at the original (untamed) Compartment,
  // which would allow a breach. Kris says this will be hard to fix until he
  // rewrites the compartment shim, possibly as a plain function instead of a
  // class. Under SES, OldCompartment.prototype.constructor is tamed

  return NewCompartment;
}

// swingset would do this to each dynamic vat
//  c.globalThis.Compartment = wrapCompartment(c.globalThis.Compartment, ..);
