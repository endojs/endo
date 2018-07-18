const test = require('tape');
const SES = require('../index.js').SES;

test('create', function(t) {
  const s = SES.makeSESRootRealm();
  t.equal(1, 1);
  t.equal(s.evaluate('1+1'), 2);
  t.end();
});

test('SESRealm does not see primal realm names', function(t) {
  let hidden = 1;
  const s = SES.makeSESRootRealm();
  t.throws(() => s.evaluate('hidden+1'), ReferenceError);
  t.end();
});

test('SESRealm also has SES', function(t) {
  const s = SES.makeSESRootRealm();
  t.equal(1, 1);
  t.equal(s.evaluate('1+1'), 2);
  t.equal(s.evaluate(`const s2 = SES.makeSESRootRealm(); s2.evaluate('1+2')`), 3);
  t.end();
});

test('SESRealm is frozen', function(t) {
  const s = SES.makeSESRootRealm();
  t.throws(() => s.evaluate('this.a = 10;'), TypeError);
  t.equal(s.evaluate('this.a'), undefined);
  t.end();
});

test('confine', function(t) {
  t.equal(SES.confine('1+1'), 2);
  t.end();
});

test('main use case', function(t) {
  const s = SES.makeSESRootRealm();
  function power(a) {
    return a + 1;
  }
  function attenuate(arg) {
    if (arg <= 0) {
      throw new TypeError('only positive numbers');
    }
    return power(arg);
  }
  const attenuated_power = s.evaluate(`(${attenuate})`, { power });
  function use(arg) {
    return power(arg);
  }
  const user = s.evaluate(`(${use})`, { power: attenuated_power });
  t.equal(user(1), 2);
  t.throws(() => user(-1), s.global.TypeError);
  t.end();
});

