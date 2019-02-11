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

import SES from './SES.js';
import { def, Nat } from './bundle/index.js';

const makeSESRootRealm = SES.makeSESRootRealm;
export default SES;
export { def, Nat, SES, makeSESRootRealm };

// this should be usable like:
// import SES from 'SES'; let r = SES.makeSESRootRealm();
// const SES = require("SES"); let r = SES.makeSESRootRealm();
// import {SES, def, Nat} from 'SES';

// f = compileExpr(source); then f(imports) can only affect 'imports'
// exports.compileExpr = function(exprSrc, opt_mitigateOpts) { };

/*
exports.makeRootSESRealm = function() {
  const r = new Realm({
    // wishlist: if set, dateNowTrap is used for 'Date.now()' and 'new
    // Date()' inside the Realm it should return a number just like
    // Date.now(). The behavior of dateNowTrap and randTrap must be inherited
    // by all child Realms, whether constructed with {intrinsics: 'inherit'}
    // or not. The new Realm will have new identities for the Date
    // constructor and Math.random even though their behavior delegates.

    //dateNowTrap() {throw TypeError("nondeterministic");},

    // wishlist: if set, randTrap is used for 'Math.random()', and should
    // either 1: always return a float or 2: always throw

    //randTrap() {throw TypeError("nondeterministic");}
  });
  r.evaluate(prepareSESRealm_js)(r.global); //populate r
  r.spawn = r.global.ses.spawn;
  r.confine = r.global.ses.confine;

  tamperProofDataProperties(r.intrinsics);
  deepFreeze(r.global);
  return r;
}
*/
