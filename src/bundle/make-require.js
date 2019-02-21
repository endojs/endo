export default function makeMakeRequire(r, harden) {
  function makeRequire(config) {
    const cache = new Map();

    function build(what) {
      // This approach denies callers the ability to use inheritance to
      // manage their config objects, but a simple "if (what in config)"
      // predicate would also be truthy for e.g. "toString" and other
      // properties of Object.prototype, and require('toString') should be
      // legal if and only if the config object included an own-property
      // named 'toString'. Incidentally, this could have been
      // "config.hasOwnProperty(what)" but eslint complained.
      if (!Object.prototype.hasOwnProperty.call(config, what)) {
        throw new Error(`Cannot find module '${what}'`);
      }
      const c = config[what];

      // some modules are hard-coded ways to access functionality that SES
      // provides directly
      if (what === '@agoric/harden') {
        return harden;
      }

      // If the config points at a simple function, it must be a pure
      // function with no dependencies (i.e. no 'require' or 'import', no
      // calls to other functions defined in the same file but outside the
      // function body). We stringify it and evaluate it inside this realm.
      if (typeof c === 'function') {
        return r.evaluate(`(${c})`);
      }

      // else we treat it as an object with an 'attenuatorSource' property
      // that defines an attenuator function, which we evaluate. We then
      // invoke it with the config object, which can contain authorities that
      // it can wrap. The return value from this invocation is the module
      // object that gets returned from require(). The attenuator function
      // and the module it returns are in-realm, the authorities it wraps
      // will be out-of-realm.
      const src = `(${c.attenuatorSource})`;
      const attenuator = r.evaluate(src);
      return attenuator(c);
    }

    function newRequire(whatArg) {
      const what = `${whatArg}`;
      if (!cache.has(what)) {
        cache.set(what, harden(build(what)));
      }
      return cache.get(what);
    }

    return newRequire;
  }

  return makeRequire;
}
