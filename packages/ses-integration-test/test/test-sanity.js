import test from 'tape';

import 'ses';

test('sanity', t => {
  t.equal(lockdown(), undefined, 'lockdown runs successfully');
  const c = new Compartment({ abc: 456 });
  t.equal(c.evaluate('123'), 123, 'simple evaluate succeeds');
  t.equal(c.evaluate('abc'), 456, 'endowment succeeds');
  t.end();
});
