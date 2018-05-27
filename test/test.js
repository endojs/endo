var test = require('tape');
var Realm = require('../proposal-realms/shim/src/realm.js').default;
var SES = require('../index.js');

test('hello', function(t) {
  t.plan(2); // need t.plan or t.end, but both is ok too
  t.equal(1, 1);
  t.equal(1+1, 2);
  t.end();
});

test('realm smoketest', function(t) {
  const r = new Realm();
  let o = r.evaluate('123+4');
  t.equal(o, 127);

  var captured = 0;
  r.global.other = function(a, b) { captured = a; return a+b; };
  o = r.evaluate('other(1,2)');
  t.equal(o, 3);
  t.equal(captured, 1);

  t.end();
});

test('activate', function(t) {
  const r = new Realm();
  r.global.startSES = SES.startSES;
  r.evaluate('startSES()');
  t.end();
});

