import { deepFreeze } from './deepFreeze.js';
import { removeProperties } from './removeProperties.js';
import { tamePrimordials } from './tame.js';

export function createSESWithRealmConstructor(creatorStrings, Realm) {
  function makeSESRealm() {
    const r = Realm.makeRootRealm();
    r.global.SES = r.evaluate(creatorStrings).createSESInThisRealm(creatorStrings);
    removeProperties(r.global);
    tamePrimordials(r.global);
    const primordialRoots = { global: r.global
                              // todo: add other roots, to reach the
                              // unreachables
                            };
    deepFreeze(primordialRoots);
    return r;
  }
  const SES = {
    makeSESRealm,
    confine(code, endowments) {
      const r = makeSESRealm();
      return r.evaluate(code, endowments);
    }
  };

  return SES;
}

export function createSESInThisRealm(creatorStrings) {
  return createSESWithRealmConstructor(creatorStrings, Realm);
}
