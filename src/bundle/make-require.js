export default function makeMakeRequire(r, harden) {
  function makeRequire(config) {
    const cache = new Map();

    function build(what) {
      if (!Object.prototype.hasOwnProperty.call(config, what)) {
        throw new Error(`Cannot find module '${what}'`);
      }
      const c = config[what];

      // some modules are hard-coded ways to access functionality that SES
      // provides directly
      if (what === '@agoric/harden') {
        return harden;
      }

      // If the config points at a simple function, we assume it is pure and
      // has no dependencies (i.e. no 'require' or 'import'). We stringify it
      // and evaluate it inside this realm.
      if (typeof c === 'function') {
        return r.evaluate(`(${c})`);
      }

      // else we assume it is an object with an 'attenuatorSource' property
      // that defines an attenuator function, which we evaluate. We then invoke
      // it with the config object, which can contain authorities that it can
      // wrap. The return value from this invocation is returned from
      // require().
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
