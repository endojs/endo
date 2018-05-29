const Realm = require('../proposal-realms/shim/src/realm.js').default;
const prepareSESRealm = require('./prepareSESRealm.js');
const prepareSESRealm_js = `(${prepareSESRealm.prepareSESRealm})`; // stringify as expr
exports.source  = prepareSESRealm_js;
const tamperProofDataProperties = require('./tamperProof.js').tamperProofDataProperties;
const deepFreeze = require('./deepFreeze.js').deepFreeze;


// f = compileExpr(source); then f(imports) can only affect 'imports'
//exports.compileExpr = function(exprSrc, opt_mitigateOpts) { };



exports.makeRootSESRealm = function() {
  const r = new Realm();
  r.evaluate(prepareSESRealm_js)(r.global); //populate r
  tamperProofDataProperties(r.intrinsics);
  deepFreeze(r.global);

  r.spawn = function(endowments) {
    const c = new r.global.Realm({intrinsics: 'inherit'} /* TODO: inherit other stuff */);
    // TODO: populate c with new evaluators
    Object.defineProperties(c.global, Object.getOwnPropertyDescriptors(endowments));
    return c;
  };

  r.confine = function(expr, endowments) {
  };

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


