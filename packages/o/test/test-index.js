// @ts-check
import { test as rawTest } from './prepare-test-env-ava.js';
import { prepareOTools } from '../index.js';

const makeContext = opts => {
  const { makeO } = prepareOTools(null, undefined, opts);
  const O = makeO({
    help: 'This is a help message',
  });
  return O;
};

const test =
  /** @type {import('ava').TestFn<{ makeO: typeof makeContext }>} */ (rawTest);
test.before('setup O', t => {
  t.context = { makeO: makeContext };
});

test('primitives', async t => {
  const O = t.context.makeO();
  t.true(await O('hello foo bar').slice(6).endsWith('bar'));
  t.is(await O(23).toFixed(2), '23.00');
  t.is(await O(39n).toString(16), '27');
  t.is(await O(true).valueOf(), true);
});

test('try/catch/finally', async t => {
  const O = t.context.makeO({
    promiseMethods: harden(['then', 'catch', 'finally']),
  });
  const retp = O.help;

  // Only Thenable methods are known.
  t.truthy('then' in retp);
  t.truthy('catch' in retp);
  t.truthy('finally' in retp);
  t.falsy('zingo' in retp);
});

test('no sync exceptions', async t => {
  // Basic test that we don't fail synchronously.
  const O = t.context.makeO();
  const retp = O.help;

  // Only Thenable methods are known.
  t.truthy('then' in retp);
  t.falsy('catch' in retp);
  t.falsy('finally' in retp);

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
  const O = t.context.makeO();
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
  const O = t.context.makeO();
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
