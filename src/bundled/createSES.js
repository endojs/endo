import { deepFreeze } from './deepFreeze.js';
import { removeProperties } from './removeProperties.js';
import { tamePrimordials } from './tame.js';

export function createSESWithRealmConstructor(creatorStrings, Realm) {
  function makeSESRootRealm() {
    const r = Realm.makeRootRealm();
    r.global.SES = r.evaluate(creatorStrings).createSESInThisRealm(creatorStrings);
    //removeProperties(r.global);
    tamePrimordials(r.global);
    const primordialRoots = { global: r.global
                              // todo: add other roots, to reach the
                              // unreachables
                            };
    deepFreeze(primordialRoots);
    return r;
  }
  const SES = {
    makeSESRootRealm,
    confine(code, endowments) {
      // todo: pass this to our parent's .evaluate() method
      const r = makeSESRootRealm();
      return r.evaluate(code, endowments);
    }
  };

  return SES;
}

export function createSESInThisRealm(creatorStrings) {
  return createSESWithRealmConstructor(creatorStrings, Realm);
}
