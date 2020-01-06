import tap from 'tap';
import { lockdown } from '../src/main.js';

const { test } = tap;

test('nested realms should work at all', t => {
  const s1 = SES.makeSESRootRealm();
  const s2 = s1.evaluate('SES.makeSESRootRealm()');
  t.equal(s2.evaluate('1+2'), 3);
  const s3 = s2.evaluate('SES.makeSESRootRealm()');
  t.equal(s3.evaluate('1+2'), 3);
  t.end();
});
