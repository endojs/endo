/**
 * @file Exports {@code enablements}, a recursively defined
 * JSON record defining the optimum set of intrinsics properties
 * that need to be "repaired" before hardening is applied on
 * enviromments subject to the override mistake.
 *
 * @author JF Paradis
 * @author Mark S. Miller
 */

/**
 * <p>Because "repairing" replaces data properties with accessors, every
 * time a repaired property is accessed, the associated getter is invoked,
 * which degrades the runtime performance of all code executing in the
 * repaired enviromment, compared to the non-repaired case. In order
 * to maintain performance, we only repair the properties of objects
 * for which hardening causes a breakage of their normal intended usage.
 *
 * There are three unwanted cases:
 * <ul>
 * <li>Overriding properties on objects typically used as records,
 *     namely {@code "Object"} and {@code "Array"}. In the case of arrays,
 *     the situation is unintentional, a given program might not be aware
 *     that non-numerical properties are stored on the underlying object
 *     instance, not on the array. When an object is typically used as a
 *     map, we repair all of its prototype properties.
 * <li>Overriding properties on objects that provide defaults on their
 *     prototype and that programs typically set using an assignment, such as
 *     {@code "Error.prototype.message"} and {@code "Function.prototype.name"}
 *     (both default to "").
 * <li>Setting-up a prototype chain, where a constructor is set to extend
 *     another one. This is typically set by assignment, for example
 *     {@code "Child.prototype.constructor = Child"}, instead of invoking
 *     Object.defineProperty();
 *
 * <p>Each JSON record enumerates the disposition of the properties on
 * some corresponding intrinsic object.
 *
 * <p>For each such record, the values associated with its property
 * names can be:
 * <ul>
 * <li>true, in which case this property is simply repaired. The
 *     value associated with that property is not traversed. For
 * 	   example, {@code "Function.prototype.name"} leads to true,
 *     meaning that the {@code "name"} property of {@code
 *     "Function.prototype"} should be repaired (which is needed
 *     when inheriting from @code{Function} and setting the subclass's
 *     {@code "prototype.name"} property). If the property is
 *     already an accessor property, it is not repaired (because
 *     accessors are not subject to the override mistake).
 * <li>"*", in which case this property is not repaired but the
 *     value associated with that property are traversed and repaired.
 * <li>Another record, in which case this property is not repaired
 *     and that next record represents the disposition of the object
 *     which is its value. For example,{@code "FunctionPrototype"}
 *     leads to another record explaining which properties {@code
 *     Function.prototype} need to be repaired.
 */
export const moderateEnablements = {
  '%ObjectPrototype%': {
    // Acorn 7 does override `constructor` by assignment, but
    // this is fixed as of acorn 8. Including the commented out
    // line below in this list confuses the Node console.
    // See https://github.com/Agoric/agoric-sdk/issues/2324
    //
    // So please update all
    // acorn dependencies to at least 8 instead. We are unable to do
    // so at this time due to a dependency via rollup. Instead we
    // do a post-install patch of acorn.
    // See https://github.com/Agoric/SES-shim/pull/588
    // If you are similarly stuck, do likewise. Or uncomment out
    // the following line and let us know why. The only known
    // cost is the ugly display from the Node console.
    //
    // constructor: true, // set by acorn 7, d3-color

    // As explained at
    // https://github.com/vega/vega/issues/3075
    // vega overrides `Object.prototype.hasOwnProperty` by
    // assignment. Those running into this should consider applying
    // the patch
    // https://github.com/Agoric/agoric-sdk/blob/master/patches/vega-util%2B1.16.0.patch
    // as we do, or
    // https://github.com/vega/vega/pull/3109/commits/50741c7e9035c407205ae45983470b8cb27c2da7
    // The owner of vega is aware of the concern, so this
    // may eventually be fixed at the source.
    // hasOwnProperty: true, // set by "vega-util".

    toLocaleString: true, // set by https://github.com/feross/buffer
    toString: true,
    valueOf: true,
  },

  '%ArrayPrototype%': {
    toString: true,
    push: true, // set by "Google Analytics"
  },

  // Function.prototype has no 'prototype' property to enable.
  // Function instances have their own 'name' and 'length' properties
  // which are configurable and non-writable. Thus, they are already
  // non-assignable anyway.
  '%FunctionPrototype%': {
    constructor: true, // set by "regenerator-runtime"
    bind: true, // set by "underscore", "express"
    toString: true, // set by "rollup"
    toLocaleString: true, // set by https://github.com/feross/buffer
  },

  '%ErrorPrototype%': {
    constructor: true, // set by "fast-json-patch", "node-fetch"
    message: true,
    name: true, // set by "precond", "ava", "node-fetch"
    toString: true, // set by "bluebird"
  },

  '%TypeErrorPrototype%': {
    constructor: true, // set by "readable-stream"
    message: true, // set by "tape"
    name: true, // set by "readable-stream"
  },

  '%SyntaxErrorPrototype%': {
    message: true, // to match TypeErrorPrototype.message
  },

  '%RangeErrorPrototype%': {
    message: true, // to match TypeErrorPrototype.message
  },

  '%URIErrorPrototype%': {
    message: true, // to match TypeErrorPrototype.message
  },

  '%EvalErrorPrototype%': {
    message: true, // to match TypeErrorPrototype.message
  },

  '%ReferenceErrorPrototype%': {
    message: true, // to match TypeErrorPrototype.message
  },

  '%PromisePrototype%': {
    constructor: true, // set by "core-js"
  },

  '%TypedArrayPrototype%': '*', // set by https://github.com/feross/buffer

  '%Generator%': {
    constructor: true,
    name: true,
    toString: true,
  },

  '%IteratorPrototype%': {
    toString: true,
  },
};

export const minEnablements = {
  '%ObjectPrototype%': {
    toString: true,
  },

  '%FunctionPrototype%': {
    toString: true, // set by "rollup"
  },

  '%ErrorPrototype%': {
    name: true, // set by "precond", "ava", "node-fetch"
  },
};
