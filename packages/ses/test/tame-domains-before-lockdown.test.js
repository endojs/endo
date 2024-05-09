import '../index.js';
import test from 'ava';
import 'domain';

test('lockdown after domains introduced', async t => {
  t.throws(() => lockdown({ domainTaming: 'safe' }));
});
