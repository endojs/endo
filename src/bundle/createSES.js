// Copyright (C) 2018 Agoric
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
