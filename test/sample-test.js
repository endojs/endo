import { test } from 'tape-promise/tape';

// TODO: remove .only when you have this test working
test.only('unique test description', async t => {
  try {
    t.true('various tests');
    t.equal(await Promise.resolve(123), 123);
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
