export default function makeRequire(sources, def) {
  const cache = new Map();
  function newRequire(what) {
    //console.log(`newRequire ${what}`);
    if (!cache.has(what)) {
      let mod;
      if (what === 'nat') {
        // I want to do this, at least for pure modules:
        //mod = eval(sources['nat']);
        // but that gets rewritten into something like
        // "_d62.u(eval(_d62.c(sources['nat'])))"
        mod = sources.natF;
      } else {
        throw new Error(`Cannot find module '${what}'`);
      }
      cache.set(what, def(mod));
    }
    return cache.get(what);
  }

  return newRequire;
}
