import tap from 'tap';
import { lockdown } from '../src/main.js';

const { test } = tap;

test('Math.random neutered by default', t => {
  const s = SES.makeSESRootRealm();
  t.throws(() => s.evaluate('Math.random()'), Error);
  t.end();
});

test('Math.random neutered upon request', t => {
  const s = SES.makeSESRootRealm({ mathRandomMode: false });
  t.throws(() => s.evaluate('Math.random()'), Error);
  t.end();
});

test('Math.random can be left alone', t => {
  const s = SES.makeSESRootRealm({ mathRandomMode: 'allow' });
  const random = s.evaluate('Math.random()');
  t.equal(typeof random, 'number');
  t.notOk(Number.isNaN(random));
  t.end();
});
