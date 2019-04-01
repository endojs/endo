import test from 'tape';
import SES from '../src/index';

// Intl is removed entirely and unconditionally, for now. We might bring this
// back in the future.

test('Intl removed by default', t => {
  const s = SES.makeSESRootRealm();
  t.equal(s.evaluate('typeof Intl'), 'undefined');
  t.throws(() => s.evaluate('({}).toLocaleString()'), Error);
  t.end();
});

/*
test('Intl neutered by default', function(t) {
  const s = SES.makeSESRootRealm();
  t.throws(() => s.evaluate('Intl.DateTimeFormat()'), Error);
  t.throws(() => s.evaluate('Intl.NumberFormat()'), Error);
  t.throws(() => s.evaluate('Intl.getCanonicalLocales()'), Error);
  t.throws(() => s.evaluate('({}).toLocaleString()'), Error);
  t.end();
});

test('Intl can be left alone', function(t) {
  const s = SES.makeSESRootRealm({intlMode: "allow", errorStackMode: "allow"});
  // All we test is that these don't throw exceptions. The exact output will
  // depend upon the locale in which we run the tests.
  s.evaluate('Intl.DateTimeFormat().format(1234)');
  s.evaluate('Intl.NumberFormat().format(1234)');
  s.evaluate('Intl.getCanonicalLocales()');
  s.evaluate('({}).toLocaleString()');
  t.end();
});
*/
