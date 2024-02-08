import { test } from './prepare-test-env-ava.js';
import { prepareOCell, stripFunction } from '../index.js';

test.before('setup O', t => {
  const makeOCell = prepareOCell(null);
  t.context.O = makeOCell(stripFunction(obj => makeOCell(obj)));
});

test('slice endsWith', async t => {
  const { O } = t.context;
  t.true(await O('hello foo bar').slice(6).endsWith('bar'));
});

test('no sync exceptions', async t => {
  // Basic test that we don't fail synchronously.
  const { O } = t.context;
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
});

test('non-function', async t => {
  const { O } = t.context;
  await t.throwsAsync(
    () => {
      return O.abc.def.ghi().jkl;
    },
    {
      message: /target has no method "ghi"/,
    },
  );
});

test('this binding', async t => {
  const { O } = t.context;
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
