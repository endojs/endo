import test from 'tape';
import SES from '../src/index.js';

test('RegExp.compile neutered by default', function(t) {
  const s = SES.makeSESRootRealm();
  t.equal(s.evaluate('(new RegExp()).compile'), undefined);
  t.end();
});

test('RegExp.compile neutered upon request', function(t) {
  const s = SES.makeSESRootRealm({regexpMode: false});
  t.equal(s.evaluate('(new RegExp()).compile'), undefined);
  t.end();
});

test('RegExp.compile can be left alone', function(t) {
  const s = SES.makeSESRootRealm({regexpMode: "allow"});
  t.notEqual(s.evaluate('(new RegExp()).compile'), undefined);
  t.end();
});
