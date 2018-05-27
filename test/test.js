var test = require('tape');
var Realm = require('../proposal-realms/shim/src/realm.js').default;

test('hello', function(t) {
  t.plan(2); // need t.plan or t.end, but both is ok too
  t.equal(1, 1);
  t.equal(1+1, 2);
  t.end();
});

test('load', function(t) {
  const r = new Realm();
  let o = r.evaluate('123+4');
  t.equal(o, 127);
  t.end();
});
