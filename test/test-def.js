import test from 'tape';
import { SES } from '../src/index';

test('SES environment does not have def/harden as a global', t => {
  const s = SES.makeSESRootRealm();
  t.equal(typeof s.global.def, 'undefined');
  function check() {
    return def({}); // eslint-disable-line no-undef
  }
  t.throws(() => s.evaluate(`${check}; check()`), ReferenceError);
  t.end();
});

test('SES environment does not have def/harden as a global despite requireMode', t => {
  const s = SES.makeSESRootRealm({ requireMode: 'allow' });
  t.equal(typeof s.global.def, 'undefined');
  function check() {
    return def({}); // eslint-disable-line no-undef
  }
  t.throws(() => s.evaluate(`${check}; check()`), ReferenceError);
  t.end();
});
