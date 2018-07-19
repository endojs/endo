export function createSESWithRealmConstructor(creatorStrings, Realm) {
  function makeSESRootRealm() {
    const r = Realm.makeRootRealm();
    const b = r.evaluate(creatorStrings);
    b.createSESInThisRealm(r.global, creatorStrings, r);
    //b.removeProperties(r.global);
    b.tamePrimordials(r.global);
    b.deepFreezePrimordials(r.global);
    return r;
  }
  const SES = {
    makeSESRootRealm,
  };

  return SES;
}

export function createSESInThisRealm(global, creatorStrings, parentRealm) {
  global.SES = createSESWithRealmConstructor(creatorStrings, Realm);
  // todo: wrap exceptions, effectively undoing the wrapping that
  // Realm.evaluate does
  global.SES.confine = (code, endowments) => parentRealm.evaluate(code, endowments);
}
