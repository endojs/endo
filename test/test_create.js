const test = require('tape');
const SES = require('../index.js').SES;

test('create', function(t) {
  const s = SES.makeSESRealm();
  t.equal(1, 1);
  t.equal(s.evaluate('1+1'), 2);
  t.end();
});

test('confine', function(t) {
  t.equal(SES.confine('1+1'), 2);
  t.end();
});
