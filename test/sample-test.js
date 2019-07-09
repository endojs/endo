import { test } from 'tape-promise/tape';

test('unique test description', async t => {
  try {
    t.true('various tests');
    t.equal(await Promise.resolve(123), 123);
  } catch (e) {
    t.assert(false, e);
  } finally {
    t.end();
  }
});
