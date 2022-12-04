/* global setTimeout */
// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from './prepare-test-env-ava.js';

import { HandledPromise } from './get-hp.js';

const { getPrototypeOf } = Object;
const { details: X } = assert;

if (typeof window !== 'undefined') {
  // Let the browser detect when the tests are done.
  /* eslint-disable-next-line no-undef */
  window.testDonePromise = new Promise(resolve => {
    test.onFinish(() => {
      // Allow the summary to be printed.
      setTimeout(resolve, 1);
    });
  });
}

test('reject/resolve returns undefined', async t => {
  const ret = await new HandledPromise((resolve, reject) => {
    t.is(resolve(123), undefined, 'resolver undefined');
    t.is(reject(999), undefined, 'rejector undefined');
  });
  t.is(ret, 123, 'resolved value');
});

test('handlers are always async', async t => {
  const queue = [];
  let target;
  const handler = {
    applyMethod(o, fn, args) {
      queue.push([o, fn, args]);
      return 'ful';
    },
  };
  let resolver2;
  const ep2 = new HandledPromise(resolve => (resolver2 = resolve), {
    applyMethod(p, fn, args) {
      queue.push(['ep2', fn, args]);
      return 'un';
    },
  });
  const unfulfilledHandler = {
    applyMethod(p, fn, args) {
      queue.push(['ep', fn, args]);
      return ep2;
    },
  };
  let resolveWithPresence;
  const ep = new HandledPromise((_, _2, rwp) => {
    resolveWithPresence = rwp;
  }, unfulfilledHandler);

  // Make sure asynchronous posts go through.
  const nested = HandledPromise.applyMethod(ep, 'myfn', ['abc', 123]);
  const firstPost = nested.then(v => {
    t.is(v, 'un', 'first post return value is un');
    t.deepEqual(
      queue,
      [
        ['ep', 'myfn', ['abc', 123]],
        ['ep2', 'myotherfn', ['def', 456]],
        [target, 'mythirdfn', ['ghi', 789]],
      ],
      'all posts in queue after first resolves',
    );
    return 'first';
  });

  t.deepEqual(queue, [], 'unfulfilled post is asynchronous');
  await Promise.resolve();
  t.deepEqual(
    queue,
    [['ep', 'myfn', ['abc', 123]]],
    'single post in queue after await',
  );

  const secondPost = HandledPromise.applyMethod(nested, 'myotherfn', [
    'def',
    456,
  ]).then(v => {
    t.is(v, 'un', 'second post return value is un');
    t.deepEqual(
      queue,
      [
        ['ep', 'myfn', ['abc', 123]],
        ['ep2', 'myotherfn', ['def', 456]],
      ],
      'both posts in queue after second resolves',
    );
    return 'second';
  });

  t.deepEqual(
    queue,
    [['ep', 'myfn', ['abc', 123]]],
    'second post is asynchronous',
  );
  await Promise.resolve();
  t.deepEqual(
    queue,
    [
      ['ep', 'myfn', ['abc', 123]],
      ['ep2', 'myotherfn', ['def', 456]],
    ],
    'second post is queued after await',
  );

  target = resolveWithPresence(handler);
  target.is = 'target';
  resolver2('un');

  const thirdPost = HandledPromise.applyMethod(ep, 'mythirdfn', [
    'ghi',
    789,
  ]).then(v => {
    t.is(v, 'ful', 'third post return value is ful');
    t.deepEqual(
      queue,
      [
        ['ep', 'myfn', ['abc', 123]],
        ['ep2', 'myotherfn', ['def', 456]],
        [target, 'mythirdfn', ['ghi', 789]],
      ],
      'third post is queued',
    );
    return 'third';
  });

  t.deepEqual(
    queue,
    [
      ['ep', 'myfn', ['abc', 123]],
      ['ep2', 'myotherfn', ['def', 456]],
    ],
    'third post is asynchronous',
  );
  await Promise.resolve();

  t.deepEqual(
    queue,
    [
      ['ep', 'myfn', ['abc', 123]],
      ['ep2', 'myotherfn', ['def', 456]],
      [target, 'mythirdfn', ['ghi', 789]],
    ],
    'all posts are actually queued after await',
  );

  t.is(await firstPost, 'first', 'first post returned properly');
  t.is(await thirdPost, 'third', 'third post returned properly');
  t.is(await secondPost, 'second', 'second post returned properly');
});

test('new HandledPromise expected errors', async t => {
  const handler = {
    get(o, _key) {
      return o;
    },
    applyFunction(o, args) {
      return args.join(',');
    },
    applyMethod(o, key, args) {
      return [key, ...args].join(',');
    },
  };

  // Full handler succeeds.
  let fullObj;
  t.is(
    await new HandledPromise((_, _2, rwp) => (fullObj = rwp(handler))),
    fullObj,
    `resolved handled Promise is equal`,
  );

  // Relay missing a method fails.
  for (const method of Object.keys(handler)) {
    /* eslint-disable no-await-in-loop */
    const { [method]: elide, ...handler2 } = handler;
    Object.setPrototypeOf(handler2, {
      [Symbol.for('extraMethod')]() {
        return 'extra method';
      },
    });
    t.is(elide, handler[method], `method ${method} is elided`);
    switch (method) {
      case 'get': {
        const noGet = new HandledPromise((_, _2, rwp) => {
          const obj = rwp(handler2);
          obj.foo = 'bar';
        });
        t.is((await noGet).foo, 'bar', `direct get`);
        await t.throwsAsync(
          () => HandledPromise.get(noGet, 'foo'),
          {
            instanceOf: TypeError,
            message: `"presenceHandler" is defined but has no methods needed for "get" (has ["[Symbol(extraMethod)]","applyFunction","applyMethod"])`,
          },
          `missing get throws`,
        );
        break;
      }
      case 'applyFunction': {
        const noApplyFunction = new HandledPromise((_, _2, rwp) => {
          // TODO: define a function presence instead.
          rwp(handler2);
        });
        await t.throwsAsync(
          () => noApplyFunction.then(naf => naf()),
          {
            instanceOf: TypeError,
            message: `naf is not a function`,
          },
          `direct applyFunction`,
        );
        t.is(
          await HandledPromise.applyFunction(noApplyFunction, ['foo', 123]),
          ',foo,123',
          `missing applyFunction uses applyMethod`,
        );
        break;
      }
      case 'applyMethod': {
        const noApplyMethod = new HandledPromise((_, _2, rwp) => {
          const obj = rwp(handler2);
          obj.bar = (str, num) => {
            t.is(str, 'abc', `default applyMethod str argument`);
            t.is(num, 123, `default applyMethod num argument`);
            return str + num;
          };
        });
        t.is(
          (await noApplyMethod).bar('abc', 123),
          'abc123',
          `direct applyMethod`,
        );
        t.is(
          await HandledPromise.applyMethod(noApplyMethod, 'bar', ['abc', 123]),
          'abc,123',
          `missing applyMethod uses applyFunction`,
        );
        break;
      }
      default:
        assert.fail(X`Unrecognized method type ${method}`, TypeError);
    }
  }

  // First resolve succeeds.
  let resolveWithPresence;
  const p = new HandledPromise((_, _2, rwp) => (resolveWithPresence = rwp));
  const obj = resolveWithPresence(handler);
  t.is(await p, obj, `first resolve succeeds`);

  resolveWithPresence(handler);
  t.is(await p, obj, `second resolve ignored`);
});

test('new HandledPromise(executor, undefined)', async t => {
  const handledP = new HandledPromise((_, _2, resolveWithPresence) => {
    setTimeout(() => {
      const o = {
        num: 123,
        str: 'my string',
        hello(name, punct = '') {
          return `Hello, ${name}${punct}`;
        },
      };

      const resolvedRelay = {
        get(p, key) {
          return o[key];
        },
        applyMethod(p, key, args) {
          return o[key](...args);
        },
      };
      resolveWithPresence(resolvedRelay);
    }, 200);
  });

  t.is(
    await HandledPromise.applyMethod(handledP, 'hello', ['World', '!']),
    'Hello, World!',
    `.applyMethod works`,
  );
  t.is(await HandledPromise.get(handledP, 'str'), 'my string', `.get works`);
  t.is(await HandledPromise.get(handledP, 'num'), 123, `.get num works`);
  t.is(
    await HandledPromise.applyMethod(handledP, 'hello', ['World']),
    'Hello, World',
    `.applyMethod works`,
  );
});

test('handled promises are promises', t => {
  const hp = new HandledPromise(() => {});
  t.is(Promise.resolve(hp), hp, 'Promise.resolve of a HandledPromise');
  t.is(
    getPrototypeOf(hp),
    Promise.prototype,
    'handled promises inherit as promises',
  );
  t.is(hp.constructor, Promise, 'The constructor is Promise');
  t.is(HandledPromise.prototype, Promise.prototype, 'shared prototype');
});

test('eventual send expected errors', async t => {
  t.is(
    await HandledPromise.get(true, 'toString'),
    true.toString,
    'true.toString',
  );
  t.is(
    await HandledPromise.get(false, 'toString'),
    false.toString,
    'false.toString',
  );
  await t.throwsAsync(
    HandledPromise.get(null, 'toString'),
    { instanceOf: TypeError },
    'get null.toString',
  );
  await t.throwsAsync(
    HandledPromise.applyFunction(true, []),
    {
      instanceOf: TypeError,
      message: 'Cannot invoke target as a function; typeof target is "boolean"',
    },
    'applyFunction true',
  );
  await t.throwsAsync(
    HandledPromise.applyFunction(false, []),
    {
      instanceOf: TypeError,
      message: 'Cannot invoke target as a function; typeof target is "boolean"',
    },
    'applyFunction false',
  );
  await t.throwsAsync(
    HandledPromise.applyFunction(undefined, []),
    {
      instanceOf: TypeError,
      message:
        'Cannot invoke target as a function; typeof target is "undefined"',
    },
    'applyFunction undefined',
  );
  await t.throwsAsync(
    HandledPromise.applyFunction(null, []),
    {
      instanceOf: TypeError,
      message: 'Cannot invoke target as a function; typeof target is "null"',
    },
    'applyFunction null',
  );
  t.is(
    await HandledPromise.applyMethod(true, 'toString', []),
    'true',
    'applyMethod true.toString()',
  );
  t.is(
    await HandledPromise.applyMethod(false, 'toString', []),
    'false',
    'applyMethod false.toString()',
  );
  await t.throwsAsync(
    HandledPromise.applyMethod(undefined, 'toString', []),
    {
      instanceOf: TypeError,
      message:
        'Cannot deliver "toString" to target; typeof target is "undefined"',
    },
    'applyMethod undefined.toString()',
  );
  await t.throwsAsync(
    HandledPromise.applyMethod(null, 'toString', []),
    {
      instanceOf: TypeError,
      message: 'Cannot deliver "toString" to target; typeof target is "null"',
    },
    'applyMethod null.toString()',
  );
  t.is(
    await HandledPromise.applyMethod({}, 'toString', []),
    '[object Object]',
    'applyMethod ({}).toString()',
  );
  await t.throwsAsync(
    HandledPromise.applyMethod(true, 'notfound', []),
    {
      instanceOf: TypeError,
      message: 'target has no method "notfound", has []',
    },
    'applyMethod true.notfound()',
  );
  await t.throwsAsync(
    HandledPromise.applyMethod(false, 'notfound', []),
    {
      instanceOf: TypeError,
      message: 'target has no method "notfound", has []',
    },
    'applyMethod false.notfound()',
  );
  await t.throwsAsync(
    HandledPromise.applyMethod(undefined, 'notfound', []),
    {
      instanceOf: TypeError,
      message:
        'Cannot deliver "notfound" to target; typeof target is "undefined"',
    },
    'applyMethod undefined.notfound()',
  );
  await t.throwsAsync(
    HandledPromise.applyMethod(null, 'notfound', []),
    {
      instanceOf: TypeError,
      message: 'Cannot deliver "notfound" to target; typeof target is "null"',
    },
    'applyMethod null.notfound()',
  );
  await t.throwsAsync(
    HandledPromise.applyMethod({ present() {}, other() {} }, 'notfound', []),
    {
      instanceOf: TypeError,
      message: 'target has no method "notfound", has ["other","present"]',
    },
    'applyMethod ({}).notfound()',
  );
});
