import test from 'tape-promise/tape';
import { HandledPromise } from '../src/index';

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
  try {
    const ret = await new HandledPromise((resolve, reject) => {
      t.equal(resolve(123), undefined, 'resolver undefined');
      t.equal(reject(999), undefined, 'rejector undefined');
    });
    t.equal(ret, 123, 'resolved value');
  } catch (e) {
    console.log('unexpected exception', e);
    t.assert(false, e);
  } finally {
    t.end();
  }
});

test('handlers are always async', async t => {
  try {
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
      t.equal(v, 'un', 'first post return value is un');
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
      t.equal(v, 'un', 'second post return value is un');
      t.deepEqual(
        queue,
        [['ep', 'myfn', ['abc', 123]], ['ep2', 'myotherfn', ['def', 456]]],
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
      [['ep', 'myfn', ['abc', 123]], ['ep2', 'myotherfn', ['def', 456]]],
      'second post is queued after await',
    );

    target = resolveWithPresence(handler);
    target.is = 'target';
    resolver2('un');

    const thirdPost = HandledPromise.applyMethod(ep, 'mythirdfn', [
      'ghi',
      789,
    ]).then(v => {
      t.equal(v, 'ful', 'third post return value is ful');
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
      [['ep', 'myfn', ['abc', 123]], ['ep2', 'myotherfn', ['def', 456]]],
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

    t.equal(await firstPost, 'first', 'first post returned properly');
    t.equal(await thirdPost, 'third', 'third post returned properly');
    t.equal(await secondPost, 'second', 'second post returned properly');
  } catch (e) {
    console.log('unexpected exception', e);
    t.assert(false, e);
  } finally {
    t.end();
  }
});

test('new HandledPromise expected errors', async t => {
  try {
    const handler = {
      get(o, _key) {
        return o;
      },
      applyMethod(o, key, _args) {
        return key;
      },
    };

    // Full handler succeeds.
    let fullObj;
    t.equal(
      await new HandledPromise((_, _2, rwp) => (fullObj = rwp(handler))),
      fullObj,
      `resolved handled Promise is equal`,
    );

    // Relay missing a method fails.
    for (const method of Object.keys(handler)) {
      /* eslint-disable no-await-in-loop */
      const { [method]: elide, ...handler2 } = handler;
      t.equal(elide, handler[method], `method ${method} is elided`);
      switch (method) {
        case 'get':
          t.equals(
            await HandledPromise.get(
              new HandledPromise((_, _2, rwp) => {
                const obj = rwp(handler2);
                obj.foo = 'bar';
              }),
              'foo',
            ),
            'bar',
            `missing ${method} defaults`,
          );
          break;
        case 'applyMethod':
          t.equals(
            await HandledPromise.applyMethod(
              new HandledPromise((_, _2, rwp) => {
                const obj = rwp(handler2);
                obj.bar = (str, num) => {
                  t.equals(str, 'abc', `default ${method} str argument`);
                  t.equals(num, 123, `default ${method} num argument`);
                  return str + num;
                };
              }),
              'bar',
              ['abc', 123],
            ),
            'abc123',
            `missing ${method} defaults`,
          );
          break;
        default:
          throw TypeError(`Unrecognized method type ${method}`);
      }
    }

    // First resolve succeeds.
    let resolveWithPresence;
    const p = new HandledPromise((_, _2, rwp) => (resolveWithPresence = rwp));
    const obj = resolveWithPresence(handler);
    t.equals(await p, obj, `first resolve succeeds`);

    resolveWithPresence(handler);
    t.equals(await p, obj, `second resolve ignored`);
  } catch (e) {
    t.assert(false, `Unexpected exception ${e}`);
  } finally {
    t.end();
  }
});

test('new HandledPromise(executor, undefined)', async t => {
  try {
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

    t.equal(
      await HandledPromise.applyMethod(handledP, 'hello', ['World', '!']),
      'Hello, World!',
      `.applyMethod works`,
    );
    t.equal(
      await HandledPromise.get(handledP, 'str'),
      'my string',
      `.get works`,
    );
    t.equal(await HandledPromise.get(handledP, 'num'), 123, `.get num works`);
    t.equal(
      await HandledPromise.applyMethod(handledP, 'hello', ['World']),
      'Hello, World',
      `.applyMethod works`,
    );
  } catch (e) {
    t.assert(false, `Unexpected exception ${e}`);
  } finally {
    t.end();
  }
});
