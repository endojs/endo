import test from 'tape';
import { SES } from '../src/index';

test('SES environment has def', t => {
  const s = SES.makeSESRootRealm();
  function check() {
    const defMe1 = function() {};
    defMe1.other = {};
    const defMe2 = def(defMe1);
    return { defMe1, defMe2 };
  }
  const { defMe1, defMe2 } = s.evaluate(`${check}; check()`);
  t.equal(defMe1, defMe2);
  t.assert(Object.isFrozen(defMe1));
  t.assert(Object.isFrozen(defMe2));
  t.assert(Object.isFrozen(defMe2.other));
  t.end();
});
