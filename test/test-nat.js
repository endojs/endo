import test from 'tape';
import { SES } from '../src/index';

test('SES environment has Nat', t => {
  const s = SES.makeSESRootRealm();
  function check() {
    const n = x => Nat(x); // eslint-disable-line no-undef
    return { n };
  }
  const { n } = s.evaluate(`${check}; check()`);
  t.equal(n(0), 0);
  t.equal(n(1), 1);
  t.equal(n(999), 999);
  t.throws(() => n('not a number'), s.global.RangeError);
  t.throws(() => n(-1), s.global.RangeError);
  t.throws(() => n(0.5), s.global.RangeError);
  t.throws(() => n(2 ** 60), s.global.RangeError);
  t.throws(() => n(NaN), s.global.RangeError);
  t.end();
});
