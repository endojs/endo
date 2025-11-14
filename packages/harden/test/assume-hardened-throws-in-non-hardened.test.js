import test from 'ava';

test('presumed-hardened harden throws in non-hardened environment', async t => {
  await t.throwsAsync(() => import('../hardened.js'), {
    message:
      'Cannot initialize @endo/harden. This program was initialized with the "hardened" condition (-C hardened) but not executed in a hardened JavaScript environment',
  });
});
