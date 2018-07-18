const test = require('tape');
const SES = require('../index.js').SES;

test('create', function(t) {
  console.log(`SES is`, SES);
  console.log(typeof(SES.makeSESRealm));
  const s = SES.makeSESRealm();
  t.equal(1, 1);
  t.end();
});
