const Realm = require('../proposal-realms/shim/src/realm.js').default;
const prepareSESRealm = require('./prepareSESRealm.js');
const prepareSESRealm_js = `(${prepareSESRealm.prepareSESRealm})`; // stringify as expr
exports.source  = prepareSESRealm_js;
const tamperProofDataProperties = require('./tamperProof.js').tamperProofDataProperties;
const deepFreeze = require('./deepFreeze.js').deepFreeze;


// f = compileExpr(source); then f(imports) can only affect 'imports'
//exports.compileExpr = function(exprSrc, opt_mitigateOpts) { };



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

/*
class SESRealm extends Realm {
  // eval exprSrc inside the realm, with access only to the realm's globals,
  // and return the result
  evaluate(exprSrc) {},
  // eval exprSrc inside the realm, with access to the realm's globals, plus
  // any properties of opt_endowments
  confine(exprSrc, opt_endowments, opt_mitigateOpts) {},
  // Function constructor which can only access realm's globals
  Function() {},

}
exports.SESRealm = SESRealm;
*/


