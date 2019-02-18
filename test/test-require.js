import test from 'tape';
import { SES } from '../src/index';

test('SES environment lacks require by default', t => {
  const s = SES.makeSESRootRealm();
  t.equal(typeof s.global.require, 'undefined');
  t.end();
});

test('SES environment can have require(nat)', t => {
  const s = SES.makeSESRootRealm({ requireMode: 'allow' });
  t.equal(typeof s.global.require, 'function');
  function check() {
    // eslint-disable-next-line global-require,import/no-unresolved
    const Nat = require('@agoric/nat');
    const n = x => Nat(x);
    return { n, Nat };
  }
  // console.log(`REQ src is ${check}`);
  const { n, Nat: n2 } = s.evaluate(`(${check})()`);
  // console.log(`Nat is ${typeof n2}`);
  t.equal(typeof n2, 'function');
  t.equal(n(0), 0);
  t.equal(n(1), 1);
  t.equal(n(999), 999);
  t.equal(n(2 ** 53 - 1), 2 ** 53 - 1);
  t.throws(() => n('not a number'), s.global.RangeError);
  t.throws(() => n(-1), s.global.RangeError);
  t.throws(() => n(0.5), s.global.RangeError);
  t.throws(() => n(2 ** 53), s.global.RangeError);
  t.throws(() => n(2 ** 60), s.global.RangeError);
  t.throws(() => n(NaN), s.global.RangeError);
  t.end();
});

test('SES environment can have require(harden)', t => {
  const s = SES.makeSESRootRealm({ requireMode: 'allow' });
  function check() {
    // eslint-disable-next-line global-require,import/no-unresolved
    const harden = require('@agoric/harden');
    const defMe1 = function me() {};
    defMe1.other = {};
    const defMe2 = harden(defMe1);
    return { defMe1, defMe2 };
  }
  const { defMe1, defMe2 } = s.evaluate(`${check}; check()`);
  t.equal(defMe1, defMe2);
  t.assert(Object.isFrozen(defMe1));
  t.assert(Object.isFrozen(defMe2));
  t.assert(Object.isFrozen(defMe2.other));
  t.end();
});
