// @ts-check
import { test as rawTest } from './prepare-test-env-ava.js';
import { prepareOTools } from '../index.js';

const makeContext = () => {
  const { makeO } = prepareOTools(null);
  const O = makeO({
    help: 'This is a help message',
  });
  return O;
};

const test =
  /** @type {import('ava').TestFn<ReturnType<typeof makeContext>>} */ (rawTest);
test.before('setup O', t => {
  t.context = makeContext();
});

test('primitives', async t => {
  const O = t.context;
  t.true(await O('hello foo bar').slice(6).endsWith('bar'));
  t.is(await O(23).toFixed(2), '23.00');
  t.is(await O(39n).toString(16), '27');
  t.is(await O(true).valueOf(), true);
});

test('no sync exceptions', async t => {
  // Basic test that we don't fail synchronously.
  const O = t.context;
  const retp = O.help;

  // Promise methods are known.
  t.truthy('then' in retp);
  t.truthy('catch' in retp);
  t.truthy('finally' in retp);

  // Nonexistent props are not known.
  t.falsy('zingo' in retp);
  // But they return a promise-like.
  // @ts-expect-error not known
  const z = retp.zingo;
  // That's true.
  t.truthy(z);

  t.is(await z, undefined);
});

test('non-function', async t => {
  const O = t.context;
  await t.throwsAsync(
    () => {
      // @ts-expect-error unknown property
      return O.def.ghi().jkl;
    },
    {
      message: /Cannot deliver "ghi" to target; typeof target is "undefined"/,
    },
  );
});

test('this binding', async t => {
  const O = t.context;
  const om = O({
    myGuy() {
      return 23;
    },
  });
  const a = { fn: om.myGuy };
  t.is(await om.myGuy(), 23);
  await t.throwsAsync(() => a.fn(), {
    message: /Cannot apply method "myGuy" to different this-binding/,
  });
  // No `this` is impermissible.
  await t.throwsAsync(() => (0, a.fn)(), {
    message: /Cannot apply method "myGuy" to different this-binding/,
  });
});
