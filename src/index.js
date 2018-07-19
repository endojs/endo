import { SES } from './SES.js';
export { SES };

// f = compileExpr(source); then f(imports) can only affect 'imports'
//exports.compileExpr = function(exprSrc, opt_mitigateOpts) { };


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
