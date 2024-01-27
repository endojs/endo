import { test } from './prepare-test-env-ava.js';
import { prepareOCell } from '../index.js';

test('basics', async t => {
  const makeOCell = prepareOCell(null);
  const O = makeOCell(makeOCell);
  t.true(await O('hello foo bar').slice(6).endsWith('bar'));

  // Basic test that we don't fail synchronously.
  const retp = O.help.me.out.please;

  // Promise methods are known.
  t.truthy('then' in retp);
  t.truthy('catch' in retp);
  t.truthy('finally' in retp);

  // Nonexistent props are not known.
  t.falsy('zingo' in retp);
  // But they return a promise-like.
  const z = retp.zingo;
  // That's true.
  t.truthy(z);

  t.is(await z, undefined);

  await t.throwsAsync(
    () => {
      return O.abc.def.ghi().jkl;
    },
    {
      message: /Cannot apply non-function "ghi"/,
    },
  );

  const fn = O({
    myGuy() {
      return 23;
    },
  }).myGuy;
  const a = { fn };
  await t.throwsAsync(() => a.fn().jkl, {
    message: /Cannot apply method "myGuy" to different this-binding/,
  });
  // No `this` is permissible.
  t.is(await fn(), 23);
});
