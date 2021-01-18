/**
 * @file Exports {@code enablements}, a recursively defined
 * JSON record defining the optimum set of intrinsics properties
 * that need to be "repaired" before hardening is applied on
 * enviromments subject to the override mistake.
 *
 * @author JF Paradis
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
  '%ObjectPrototype%': '*',

  '%ArrayPrototype%': '*',

  '%FunctionPrototype%': {
    constructor: true, // set by "regenerator-runtime"
    bind: true, // set by "underscore"
    name: true,
    toString: true, // set by "rollup"
  },

  '%ErrorPrototype%': {
    constructor: true, // set by "fast-json-patch"
    message: true,
    name: true, // set by "precond", "ava"
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

  '%TypedArrayPrototype%': '*',

  '%Generator%': {
    constructor: true,
    name: true,
    toString: true,
  },

  '%IteratorPrototype%': '*',
};

export const minEnablements = {
  '%ObjectPrototype%': {
    toString: true,
  },

  '%FunctionPrototype%': {
    toString: true, // set by "rollup"
  },

  '%ErrorPrototype%': {
    name: true, // set by "precond", "ava"
  },
};
