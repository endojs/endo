import test from 'ava';
import './no-eval.js';
import '../index.js';

// I've manually verified that this is not failing due to the dynamic-eval
// check in src/lockdown-shim.js, and the remaining issues are captured in
// https://github.com/endojs/endo/issues/903.
test.failing('lockdown must not throw when eval is forbidden', t => {
  lockdown({ errorTaming: 'unsafe' });
  t.pass();
});
