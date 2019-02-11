import test from 'tape';
import { SES } from '../src/index';

test('RegExp.compile neutered by default', function(t) {
  const s = SES.makeSESRootRealm();
  t.equal(s.evaluate('(new RegExp()).compile'), undefined);
  t.end();
});

test('RegExp.compile neutered upon request', function(t) {
  const s = SES.makeSESRootRealm({ regexpMode: false });
  t.equal(s.evaluate('(new RegExp()).compile'), undefined);
  t.end();
});

test('RegExp.compile cannot be left alone, even if mode=allow', function(t) {
  const s = SES.makeSESRootRealm({ regexpMode: 'allow' });
  t.equal(s.evaluate('(new RegExp()).compile'), undefined);
  t.end();
});
