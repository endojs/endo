// @ts-check

/** @param { unknown[] } _args  */
function debug(..._args) {
  // console.log(...args);
}

/**
 *
 * @param { endo.CompartmentMap } compartmap
 * @param { unknown } HandledPromise
 */
export function loadMain(compartmap, HandledPromise) {
  // ISSUE: doesn't seem to work:
  const { entries, fromEntries, keys } = Object;
  // const entries = o => Object.entries(o);
  // const fromEntries = pvs => Object.fromEntries(pvs);
  // const keys = o => Object.keys(o);
  // debug('entries, ...', { entries: typeof entries, fromEntries: typeof fromEntries, keys: typeof keys });

  /**
   *
   * @param {{ [globalPropertyName: string]: any }} endowments
   * @param {{[key: string]: FullSpecifier | ModuleNamespace}} map
   * @param { CompartmentConstructorOptions } options
   */
  class SESCompartment extends Compartment {
    constructor(endowments = {}, map = {}, options = {}) {
      debug("SESCompartment", { endowments, map, options });
      const sesGlobals = {
        harden,
        console,
        HandledPromise,
        Compartment: SESCompartment
      };
      super({ ...sesGlobals, ...endowments }, map, options);
    }
  }

  /**
   * @template T
   * @param { (k: string) => T } f
   * @returns {(k: string) => T}
   */
  const memoize = f => {
    /** @type { {[k: string]: T} } */
    const cache = {};
    return k => cache[k] || (cache[k] = f(k));
  };
  /** @type {(spec: string) => string} */
  const unjs = spec => spec.replace(/\.js$/, "");
  /** @type {(spec: string) => string} */
  const unrel = spec => spec.replace(/^\.\//, "/");
  /** @type {(base: string, ref: string) => string} */
  const join = (base, ref) => `${base}${unjs(ref.slice(2))}`;
  /** @type {(loc: string) => Compartment} */
  const pkgCompartment = memoize(loc => {
    /** @type {(ref: string) => [string, string]} */
    const intraPkg = ref => {
      debug("intraPkg", { loc, ref });
      return [unjs(unrel(ref).slice(1)), join(loc, ref)];
    };
    /** @type {(entry: [string, { compartment: string, module: string }]) => [string, ModuleNamespace]} */
    function interPkg([specifier, { compartment, module }]) {
      const pc = pkgCompartment(compartment);
      const fullSpecifier = unjs(module.slice(2));
      // const fullSpecifier = join(compartment, module);
      debug("interPkg", {
        loc,
        specifier,
        compartment,
        module,
        fullSpecifier
      });
      return [specifier, pc.importNow(fullSpecifier)];
    }
    // @ts-ignore TODO: reconcile endo types (extra contents)
    const { contents, modules } = compartmap.compartments[loc];
    /** @type { {[key: string]: FullSpecifier | ModuleNamespace} } */
    const cmap = fromEntries([
      ...contents.map(intraPkg),
      ...entries(modules).map(interPkg)
    ]);
    debug({ loc, contents, modules: keys(modules), map: cmap });
    return new SESCompartment({}, cmap);
  });
  return pkgCompartment(compartmap.main);
}
