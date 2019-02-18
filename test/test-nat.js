import test from 'tape';
import { SES } from '../src/index';

test('SES environment does not have Nat as a global', t => {
  const s = SES.makeSESRootRealm();
  t.equal(typeof s.global.Nat, 'undefined');
  function check() {
    const n = x => Nat(x); // eslint-disable-line no-undef
    return { n };
  }
  const { n } = s.evaluate(`${check}; check()`);

  t.throws(() => n(0), s.global.ReferenceError);
  t.end();
});

test('SES environment does not have Nat as a global despite require()', t => {
  const s = SES.makeSESRootRealm({ requireMode: 'allow' });
  t.equal(typeof s.global.Nat, 'undefined');
  function check() {
    const n = x => Nat(x); // eslint-disable-line no-undef
    return { n };
  }
  const { n } = s.evaluate(`${check}; check()`);

  t.throws(() => n(0), s.global.ReferenceError);
  t.end();
});
