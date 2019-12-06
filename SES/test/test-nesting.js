import test from 'tape';
import SES from '../src/index';

test('nested realms should work at all', t => {
  const s1 = SES.makeSESRootRealm();
  const s2 = s1.evaluate('SES.makeSESRootRealm()');
  t.equal(s2.evaluate('1+2'), 3);
  const s3 = s2.evaluate('SES.makeSESRootRealm()');
  t.equal(s3.evaluate('1+2'), 3);
  t.end();
});
