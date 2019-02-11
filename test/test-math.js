import test from 'tape';
import { SES } from '../src/index';

test('Math.random neutered by default', function(t) {
  const s = SES.makeSESRootRealm();
  t.throws(() => s.evaluate('Math.random()'), Error);
  t.end();
});

test('Math.random neutered upon request', function(t) {
  const s = SES.makeSESRootRealm({ mathRandomMode: false });
  t.throws(() => s.evaluate('Math.random()'), Error);
  t.end();
});

test('Math.random can be left alone', function(t) {
  const s = SES.makeSESRootRealm({ mathRandomMode: 'allow' });
  const random = s.evaluate('Math.random()');
  t.equal(typeof random, 'number');
  t.notOk(Number.isNaN(random));
  t.end();
});
