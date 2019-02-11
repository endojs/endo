exports.prepareSESRealm = function(global) {
  // hello i am source
  // TODO

  global.ses = {};

  global.ses.spawn = function(endowments = {}) {
    const c = new Realm(
      { intrinsics: 'inherit' } /* TODO: inherit other stuff */,
    );
    // TODO: populate c with new evaluators
    Object.defineProperties(
      c.global,
      Object.getOwnPropertyDescriptors(endowments),
    );
    return c;
  };

  global.ses.confine = function(expr, endowments = {}) {
    return global.ses.spawn(endowments).evaluate(expr);
  };
};
