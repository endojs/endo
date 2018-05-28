var Realm = require('../proposal-realms/shim/src/realm.js').default;
let SES = require("./SES.js");

// f2 = tamperProof(f1); now f2 is safe against some things
exports.tamperProof = function() { };
exports.constFunc = function() {};

// f = compileExpr(source); then f(imports) can only affect 'imports'
exports.compileExpr = function(exprSrc, opt_mitigateOpts) { };

class SESRealm extends Realm {
  // eval exprSrc inside the realm, with access only to the realm's globals,
  // and return the result
  eval(exprSrc) {},
  // eval exprSrc inside the realm, with access to the realm's globals, plus
  // any properties of opt_endowments
  confine(exprSrc, opt_endowments, opt_mitigateOpts) {},
  // Function constructor which can only access realm's globals
  Function() {},

}

exports.SESRealm = SESRealm;

