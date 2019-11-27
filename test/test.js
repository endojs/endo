import test from 'tape-promise/tape';
import '../src/index';

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
    const ret = await Promise.makeHandled((resolve, reject) => {
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
      POST(o, fn, args) {
        queue.push([o, fn, args]);
        return 'ful';
      },
    };
    let resolver2;
    const ep2 = Promise.makeHandled(resolve => (resolver2 = resolve), {
      POST(p, fn, args) {
        queue.push(['ep2', fn, args]);
        return 'un';
      },
    });
    const unfulfilledHandler = {
      POST(p, fn, args) {
        queue.push(['ep', fn, args]);
        return ep2;
      },
    };
    let resolveWithPresence;
    const ep = Promise.makeHandled((_, _2, resolver) => {
      resolveWithPresence = resolver;
    }, unfulfilledHandler);

    // Make sure asynchronous posts go through.
    const nested = ep.post('myfn', ['abc', 123]);
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

    const secondPost = nested.post('myotherfn', ['def', 456]).then(v => {
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

    const thirdPost = ep.post('mythirdfn', ['ghi', 789]).then(v => {
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

test('Promise.makeHandled expected errors', async t => {
  try {
    const handler = {
      GET(key) {
        return key;
      },
      POST(key, args) {
        return args;
      },
    };

    // Full handler succeeds.
    let fullObj;
    t.equal(
      await Promise.makeHandled((_, _2, rwp) => (fullObj = rwp(handler))),
      fullObj,
      `resolved handled Promise is equal`,
    );

    // Relay missing a method fails.
    for (const method of Object.keys(handler)) {
      /* eslint-disable no-await-in-loop */
      const { [method]: elide, ...handler2 } = handler;
      t.equal(elide, handler[method], `method ${method} is elided`);
      switch (method) {
        case 'GET':
          t.equals(
            await Promise.makeHandled((_, _2, rwp) => {
              const obj = rwp(handler2);
              obj.foo = 'bar';
            }).get('foo'),
            'bar',
            `missing ${method} defaults`,
          );
          break;
        case 'POST':
          t.equals(
            await Promise.makeHandled((_, _2, rwp) => {
              const obj = rwp(handler2);
              obj.bar = (str, num) => {
                t.equals(str, 'abc', `default ${method} str argument`);
                t.equals(num, 123, `default ${method} num argument`);
                return str + num;
              };
            }).post('bar', ['abc', 123]),
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
    const p = Promise.makeHandled((_, _2, rwp) => (resolveWithPresence = rwp));
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

test('Promise.makeHandled(executor, undefined)', async t => {
  try {
    const handledP = Promise.makeHandled((_, _2, resolveWithPresence) => {
      setTimeout(() => {
        const o = {
          num: 123,
          str: 'my string',
          hello(name, punct = '') {
            return `Hello, ${name}${punct}`;
          },
        };

        const resolvedRelay = {
          GET(p, key) {
            return o[key];
          },
          POST(p, key, args) {
            return o[key](...args);
          },
        };
        resolveWithPresence(resolvedRelay);
      }, 200);
    });

    t.equal(
      await handledP.post('hello', ['World', '!']),
      'Hello, World!',
      `.post works`,
    );
    t.equal(await handledP.get('str'), 'my string', `.get works`);
    t.equal(await handledP.get('num'), 123, `.get num works`);
    t.equal(
      await handledP.invoke('hello', 'World'),
      'Hello, World',
      `.invoke works`,
    );
  } catch (e) {
    t.assert(false, `Unexpected exception ${e}`);
  } finally {
    t.end();
  }
});

test('Promise.all', async t => {
  function* generator() {
    yield 9;
    yield Promise.resolve(8).then(res => res * 10);
    yield Promise.resolve(7).then(res => -res);
  }

  try {
    t.deepEqual(
      await Promise.all([1, Promise.resolve(2), 3]),
      [1, 2, 3],
      `.all works`,
    );
    t.deepEqual(
      await Promise.all(generator()),
      [9, 80, -7],
      `.all on generator works`,
    );

    // Ensure that a rejected promise rejects all.
    const toThrow = RangeError('expected');
    await t.rejects(
      Promise.all([1, Promise.reject(toThrow), 3]),
      toThrow,
      `.all rejects properly`,
    );
  } catch (e) {
    t.assert(false, `Unexpected exception ${e}`);
  } finally {
    t.end();
  }
});

test.skip('Promise.allSettled', async t => {
  let shouldThrow;
  function* generator() {
    yield 9;
    shouldThrow = Error('expected');
    yield Promise.reject(shouldThrow).catch(_ => 80);
    yield Promise.resolve(7).then(res => -res);
  }

  try {
    t.deepEqual(
      await Promise.allSettled([1, Promise.resolve(2), 3]),
      [
        { status: 'fulfilled', value: 1 },
        { status: 'fulfilled', value: 2 },
        { status: 'fulfilled', value: 3 },
      ],
      `.allSettled gets all fulfillments`,
    );

    t.deepEqual(
      await Promise.allSettled(generator()),
      [
        { status: 'fulfilled', value: 9 },
        { status: 'fulfilled', value: 80 },
        { status: 'fulfilled', value: -7 },
      ],
      `.allSettled gets all generated fulfillments`,
    );

    // Ensure that a rejected promise still settles.
    shouldThrow = Error('expected');
    t.deepEqual(
      await Promise.allSettled([1, Promise.reject(shouldThrow), 3]),
      [
        { status: 'fulfilled', value: 1 },
        { status: 'rejected', reason: shouldThrow },
        { status: 'fulfilled', value: 3 },
      ],
      `.allSettled detects rejections`,
    );
  } catch (e) {
    t.assert(false, `Unexpected exception ${e}`);
  } finally {
    t.end();
  }
});

test('Promise.race', async t => {
  let shouldThrow;
  const delay = (value, millis, ...args) =>
    new Promise(resolve => setTimeout(() => resolve(value), millis), ...args);

  function* generator() {
    yield delay(9, 500);
    shouldThrow = Error('expected');
    yield Promise.reject(shouldThrow);
    yield delay(7, 1000);
  }

  try {
    try {
      t.equal(
        await Promise.race([1, delay(2, 1000), delay(3, 500)]),
        1,
        `.race works`,
      );
    } catch (e) {
      t.assert(false, `unexpected exception ${e}`);
    }

    await t.rejects(
      Promise.race(generator()),
      shouldThrow,
      `.race generator throws`,
    );
  } catch (e) {
    t.assert(false, `Unexpected exception ${e}`);
  } finally {
    t.end();
  }
});

test('get', async t => {
  try {
    const res = await Promise.resolve([123, 456, 789]).get(1);
    t.equal(res, 456, `.get works`);
  } catch (e) {
    t.assert(false, `Unexpected exception ${e}`);
  } finally {
    t.end();
  }
});

test('post', async t => {
  try {
    const fn = () => 'hello';
    fn.a = n => n + 1;
    fn[2] = (n1, n2) => n1 * n2;
    const ep = Promise.resolve(fn);
    t.equal(await ep.post('a', [3]), 4, `.post('a', args) works`);
    t.equal(await ep.post(2, [3, 4]), 12, `.post(2, args) works`);
    t.equal(
      await ep.get(2).post(undefined, [3, 4]),
      12,
      `.post(undefined, args) works`,
    );
    t.equal(
      await ep.post(undefined, []),
      'hello',
      `.post(undefined, []) works`,
    );
  } catch (e) {
    t.assert(false, `Unexpected exception ${e}`);
  } finally {
    t.end();
  }
});

test('invoke', async t => {
  try {
    const fn = () => 'hello';
    fn.a = n => n + 1;
    fn[2] = (n1, n2) => n1 * n2;
    const ep = Promise.resolve(fn);
    t.equal(await ep.invoke('a', 3), 4, `.invoke(two args) works`);
    t.equal(await ep.invoke(2, 3, 4), 12, `.invoke(three args) works`);
    t.equal(await ep.invoke(undefined), 'hello', `.invoke(undefined) works`);
  } catch (e) {
    t.assert(false, `Unexpected exception ${e}`);
  } finally {
    t.end();
  }
});

test('fcall', async t => {
  try {
    const ep = Promise.resolve((a, b) => a * b);
    t.equal(await ep.fcall(3, 6), 18, `.fcall works`);
  } catch (e) {
    t.assert(false, `Unexpected exception ${e}`);
  } finally {
    t.end();
  }
});

test('fapply', async t => {
  try {
    const ep = Promise.resolve((a, b) => a * b);
    t.equal(await ep.fapply([3, 6]), 18, `.fapply works`);
  } catch (e) {
    t.assert(false, `Unexpected exception ${e}`);
  } finally {
    t.end();
  }
});
