import test from 'ava';

import { localAsyncHandler } from '../src/async-handler.js';
import { makeAsyncReflect } from '../src/async-reflect.js';

const reflect = makeAsyncReflect();

test('local handler separates queue acknowledgement from completion', async t => {
  /** @type {(value: number) => void} */
  let finish = () => t.fail('completion resolver was not installed');
  const pending = new Promise(resolve => {
    finish = resolve;
  });
  const outer = localAsyncHandler.get(
    { value: pending },
    'value',
    undefined,
    {
      result: Promise.resolve(),
      senderContext: {},
      sendMode: 'send',
      harden: 'none',
    },
  );
  t.true(Object.isFrozen(outer));
  const envelope = await outer;
  t.true(Object.isFrozen(envelope));
  const { result } = envelope;
  t.true(Object.isFrozen(result));
  let settled = false;
  result.then(() => {
    settled = true;
  });
  await new Promise(resolve => setImmediate(resolve));
  t.false(settled);
  finish(7);
  t.is(await result, 7);
});

test('local handler harden all covers inner fulfillment and rejection', async t => {
  const options = {
    result: Promise.resolve(),
    senderContext: {},
    sendMode: /** @type {const} */ ('send'),
    harden: /** @type {const} */ ('all'),
  };
  const value = { label: 'ready' };
  const fulfilled = await localAsyncHandler.get(
    { value },
    'value',
    undefined,
    options,
  );
  t.is(await fulfilled.result, value);
  t.true(Object.isFrozen(value));

  const reason = Error('failed');
  const rejected = await localAsyncHandler.apply(
    () => Promise.reject(reason),
    undefined,
    [],
    options,
  );
  const caught = await t.throwsAsync(rejected.result);
  t.is(caught, reason);
  t.true(Object.isFrozen(reason));
});

test('reflect sendMode selects queue or completion without suppressing normal errors', async t => {
  /** @type {(value: string) => void} */
  let finish = () => t.fail('completion resolver was not installed');
  const pending = new Promise(resolve => {
    finish = resolve;
  });
  const target = { value: pending };
  const queued = reflect.get(target, 'value', undefined, {
    sendMode: 'sendOnly',
    senderContext: {},
  });
  const completed = reflect.get(target, 'value');
  const queuedResult = await queued;
  t.is(queuedResult, undefined);
  let settled = false;
  completed.then(() => {
    settled = true;
  });
  await new Promise(resolve => setImmediate(resolve));
  t.false(settled);
  finish('done');
  t.is(await completed, 'done');

  await t.throwsAsync(reflect.get(null, 'value'), { instanceOf: TypeError });
  t.is(
    await reflect.get(null, 'value', undefined, {
      sendMode: 'sendOnly',
      senderContext: {},
    }),
    undefined,
  );
});

test('harden all freezes targets, receivers, argument values, and fulfilled results', async t => {
  const opts = { senderContext: {}, harden: /** @type {const} */ ('all') };
  const target = { value: { label: 'ready' } };
  const receiver = {};
  const resultP = reflect.get(target, 'value', receiver, opts);
  t.true(Object.isFrozen(resultP));
  const value = await resultP;
  t.is(value, target.value);
  t.true(Object.isFrozen(target));
  t.true(Object.isFrozen(receiver));
  t.true(Object.isFrozen(value));
  t.true(Object.isFrozen(opts));

  const thisArg = { marker: true };
  const arg = { value: 1 };
  const args = [arg];
  const returned = { answer: 2 };
  /**
   * @this {{ marker: boolean }}
   * @param {{ value: number }} received
   */
  const fn = function inspectHardening(received) {
    t.is(this, thisArg);
    t.is(received, arg);
    t.true(Object.isFrozen(this));
    t.true(Object.isFrozen(received));
    return returned;
  };
  const applied = await reflect.apply(fn, thisArg, args, opts);
  t.is(applied, returned);
  t.true(Object.isFrozen(fn));
  t.true(Object.isFrozen(args));
  t.true(Object.isFrozen(returned));
});

test('harden all freezes rejection reasons, including send-only completions', async t => {
  const opts = { senderContext: {}, harden: /** @type {const} */ ('all') };
  const inputError = Error('input');
  const fromInput = await t.throwsAsync(
    reflect.get(Promise.reject(inputError), 'value', undefined, opts),
  );
  t.is(fromInput, inputError);
  t.true(Object.isFrozen(inputError));

  const operationError = Error('operation');
  const fromOperation = await t.throwsAsync(
    reflect.apply(() => Promise.reject(operationError), undefined, [], opts),
  );
  t.is(fromOperation, operationError);
  t.true(Object.isFrozen(operationError));

  /** @type {(reason: Error) => void} */
  let fail = () => t.fail('rejector was not installed');
  const pending = new Promise((_resolve, reject) => {
    fail = reject;
  });
  const queued = reflect.apply(() => pending, undefined, [], {
    ...opts,
    sendMode: 'sendOnly',
  });
  const queuedResult = await queued;
  t.is(queuedResult, undefined);
  const sendOnlyError = Error('sendOnly');
  fail(sendOnlyError);
  await new Promise(resolve => setImmediate(resolve));
  t.true(Object.isFrozen(sendOnlyError));
});

test('harden all freezes handler queue failures', async t => {
  const reason = Error('queue');
  const handler = {
    ...localAsyncHandler,
    get() {
      return Promise.reject(reason);
    },
  };
  const customReflect = makeAsyncReflect(Promise, handler);
  const resultP = customReflect.get({}, 'value', undefined, {
    senderContext: {},
    harden: 'all',
  });
  const caught = await t.throwsAsync(resultP);
  t.is(caught, reason);
  t.true(Object.isFrozen(reason));
});

async () => {
  /** @type {{ label: string } | null} */
  const maybe = Math.random() < 0.5 ? null : { label: 'ready' };
  /** @satisfies {string | undefined} */ (await reflect.optional(
    maybe,
    present => present.label,
  ));
};

test('optional skips a nullish value without calling the continuation', async t => {
  let calls = 0;
  const continuation = () => {
    calls += 1;
    return 'unreachable';
  };

  const fromNull = await reflect.optional(null, continuation);
  const fromUndefined = await reflect.optional(
    Promise.resolve(undefined),
    continuation,
  );
  t.is(fromNull, undefined);
  t.is(fromUndefined, undefined);
  t.is(calls, 0);
});

test('optional continues for non-nullish falsy values', async t => {
  const seen = [];
  const results = await Promise.all(
    [false, 0, ''].map(value =>
      reflect.optional(value, present => {
        seen.push(present);
        return present;
      }),
    ),
  );
  t.deepEqual(results, [false, 0, '']);
  t.deepEqual(seen, [false, 0, '']);
});

test('optional adopts a continuation promise and supports further operations', async t => {
  const target = { nested: { value: 42 } };
  const result = await reflect.optional(Promise.resolve(target), present =>
    Promise.resolve(present.nested.value),
  );
  t.is(result, 42);
});

test('optional can continue with a mutable target', async t => {
  const target = {};
  const result = await reflect.optional(target, present =>
    reflect.set(present, 'ready', true),
  );
  t.true(result);
  t.true(target.ready);
});

test('optional hardens its continuation but leaves the fulfilled result mutable', async t => {
  const result = { value: 1 };
  const continuation = () => result;
  const actual = await reflect.optional('ready', continuation);
  t.is(actual, result);
  t.true(Object.isFrozen(continuation));
  t.false(Object.isFrozen(result));
});

test('optional defers thenable assimilation and continuation', async t => {
  const events = [];
  const value = {
    get then() {
      events.push('then');
      return resolve => resolve('ready');
    },
  };
  const resultP = reflect.optional(value, present => {
    events.push('continue');
    return present;
  });

  t.deepEqual(events, []);
  const result = await resultP;
  t.is(result, 'ready');
  t.deepEqual(events, ['then', 'continue']);
});

test('optional propagates input and continuation failures', async t => {
  const inputError = Error('input');
  const continuationError = Error('continuation');
  let called = false;

  const fromInput = await t.throwsAsync(
    reflect.optional(Promise.reject(inputError), () => {
      called = true;
    }),
  );
  t.is(fromInput, inputError);
  t.false(called);

  const fromThrow = await t.throwsAsync(
    reflect.optional('ready', () => {
      throw continuationError;
    }),
  );
  t.is(fromThrow, continuationError);

  const fromRejection = await t.throwsAsync(
    reflect.optional('ready', () => Promise.reject(continuationError)),
  );
  t.is(fromRejection, continuationError);
});

test('get waits for its target and uses Reflect.get', async t => {
  const events = [];
  const key = Symbol('key');
  const target = Object.create({
    get [key]() {
      events.push('get');
      return { value: 3 };
    },
  });
  const resultP = reflect.get(Promise.resolve(target), key);
  t.true(Object.isFrozen(resultP));
  t.deepEqual(events, []);

  const result = await resultP;
  t.deepEqual(events, ['get']);
  t.deepEqual(result, { value: 3 });
  t.false(Object.isFrozen(result));
  const primitiveError = await t.throwsAsync(reflect.get('abc', 'length'));
  t.true(primitiveError instanceof TypeError);
});

test('get and set pass an optional receiver through to Reflect', async t => {
  const target = {
    get value() {
      return this.marker;
    },
    set value(next) {
      this.received = next;
    },
  };
  const receiver = { marker: 'receiver' };

  const fromReceiver = await reflect.get(target, 'value', receiver);
  t.is(fromReceiver, 'receiver');
  t.is(await reflect.get(target, 'value'), undefined);
  t.true(await reflect.set(target, 'value', 42, receiver));
  t.is(receiver.received, 42);
  t.false(Object.isFrozen(receiver));
  t.false(Object.hasOwn(target, 'received'));

  const missingReceiver = await t.throwsAsync(
    reflect.get(target, 'value', undefined),
  );
  t.true(missingReceiver instanceof TypeError);
});

test('apply preserves mutable receiver and values while freezing a copy of args', async t => {
  const thisArg = { factor: 2 };
  const arg = { value: 4 };
  const args = [arg];
  const result = { value: 8 };
  /**
   * @this {{ factor: number }}
   * @param {{ value: number }} seen
   */
  const target = function double(seen) {
    t.is(this, thisArg);
    t.false(Object.isFrozen(this));
    t.false(Object.isFrozen(seen));
    this.factor += 1;
    seen.value += 1;
    return Promise.resolve(result);
  };
  const handler = {
    ...localAsyncHandler,
    apply(fn, receiver, receivedArgs, options) {
      t.not(receivedArgs, args);
      t.true(Object.isFrozen(receivedArgs));
      t.is(receivedArgs[0], arg);
      return localAsyncHandler.apply(fn, receiver, receivedArgs, options);
    },
  };
  const customReflect = makeAsyncReflect(Promise, handler);
  const resultP = customReflect.apply(Promise.resolve(target), thisArg, args);
  t.true(Object.isFrozen(resultP));
  const actual = await resultP;
  t.is(actual, result);
  t.false(Object.isFrozen(args));
  t.false(Object.isFrozen(arg));
  t.false(Object.isFrozen(result));
  t.is(thisArg.factor, 3);
  t.is(arg.value, 5);
});

test('invoke looks up an inherited method and applies the supplied receiver', async t => {
  const arg = { value: 7 };
  const args = [arg];
  const thisArg = { multiplier: 2 };
  const receiver = Object.create({
    /**
     * @this {{ multiplier: number }}
     * @param {{ value: number }} seen
     */
    method(seen) {
      t.is(this, thisArg);
      t.false(Object.isFrozen(this));
      t.false(Object.isFrozen(seen));
      return seen.value * this.multiplier;
    },
  });

  const handler = {
    ...localAsyncHandler,
    invoke(target, receiverArg, key, receivedArgs, options) {
      t.not(receivedArgs, args);
      t.true(Object.isFrozen(receivedArgs));
      return localAsyncHandler.invoke(
        target,
        receiverArg,
        key,
        receivedArgs,
        options,
      );
    },
  };
  const customReflect = makeAsyncReflect(Promise, handler);
  const result = await customReflect.invoke(
    Promise.resolve(receiver),
    thisArg,
    'method',
    args,
  );
  t.is(result, 14);
  t.false(Object.isFrozen(receiver));
  t.false(Object.isFrozen(thisArg));
  t.false(Object.isFrozen(arg));
  t.false(Object.isFrozen(args));
});

test('has and ownKeys await the target and use normal Reflect semantics', async t => {
  const symbol = Symbol('item');
  const target = Object.create({ inherited: true });
  target.visible = 1;
  target[symbol] = 2;
  const hasP = reflect.has(Promise.resolve(target), 'inherited');
  const keysP = reflect.ownKeys(Promise.resolve(target));

  const inherited = await hasP;
  t.true(inherited);
  t.false(await reflect.has(target, 'missing'));
  const keys = await keysP;
  t.deepEqual(keys, ['visible', symbol]);
  t.false(Object.isFrozen(keys));
  t.false(Object.isFrozen(target));
});

test('construct leaves argument values and instances mutable and accepts newTarget', async t => {
  const arg = { value: 5 };
  const args = [arg];
  function Target(value) {
    t.false(Object.isFrozen(value));
    this.value = value.value;
  }
  function NewTarget() {}

  const handler = {
    ...localAsyncHandler,
    construct(target, receivedArgs, newTarget, options) {
      t.not(receivedArgs, args);
      t.true(Object.isFrozen(receivedArgs));
      return localAsyncHandler.construct(
        target,
        receivedArgs,
        newTarget,
        options,
      );
    },
  };
  const customReflect = makeAsyncReflect(Promise, handler);
  const result = await customReflect.construct(Promise.resolve(Target), args);
  t.true(result instanceof Target);
  t.is(result.value, 5);
  t.false(Object.isFrozen(result));
  t.false(Object.isFrozen(arg));
  t.false(Object.isFrozen(args));

  const withNewTarget = await reflect.construct(
    Target,
    [{ value: 6 }],
    Promise.resolve(NewTarget),
  );
  t.true(withNewTarget instanceof NewTarget);
  t.is(withNewTarget.value, 6);
  t.false(Object.isFrozen(withNewTarget));
  t.true(Object.isFrozen(NewTarget));
  const explicitUndefined = await t.throwsAsync(
    reflect.construct(Target, [], undefined),
  );
  t.true(explicitUndefined instanceof TypeError);
});

test('set and deleteProperty return booleans from normal Reflect operations', async t => {
  const target = {};
  const value = { ready: true };
  const setP = reflect.set(Promise.resolve(target), 'item', value);
  t.false('item' in target);
  const setResult = await setP;
  t.true(setResult);
  t.is(target.item, value);
  t.true(Object.isFrozen(value));

  const deleteP = reflect.deleteProperty(target, 'item');
  t.true('item' in target);
  const deleteResult = await deleteP;
  t.true(deleteResult);
  t.false('item' in target);

  Object.defineProperty(target, 'fixed', {
    value: 1,
    writable: false,
    configurable: false,
  });
  t.false(await reflect.set(target, 'fixed', 2));
  t.false(await reflect.deleteProperty(target, 'fixed'));
});

test('eventual options follow the Reflect operands without changing local operations', async t => {
  const options = { senderContext: { requestId: 'local' } };
  const target = { value: 1, method() { return this.value; } };
  const argumentList = [];
  function Created() {
    this.value = 2;
  }

  const value = await reflect.get(target, 'value', target, options);
  t.is(value, 1);
  t.true(await reflect.has(target, 'value', options));
  t.deepEqual(await reflect.ownKeys(target, options), ['value', 'method']);
  t.is(await reflect.apply(() => 3, undefined, argumentList, options), 3);
  t.true(await reflect.set(target, 'other', 4, target, options));
  t.true(await reflect.deleteProperty(target, 'other', options));
  t.is(await reflect.invoke(target, target, 'method', argumentList, options), 1);
  t.is((await reflect.construct(Created, argumentList, Created, options)).value, 2);
  t.is(await reflect.optional(5, present => present + 1, options), 6);
});

test('reflect rejects a supplied result and sends its result identity and sanitized context to a handler', async t => {
  const suppliedResult = Promise.resolve();
  const rejected = await t.throwsAsync(
    reflect.has({}, 'x', {
      result: suppliedResult,
      senderContext: {},
    }),
    { instanceOf: TypeError, message: /result must be empty/ },
  );
  t.true(rejected instanceof TypeError);

  const source = Object.create({ inherited: 'hidden' });
  source.requestId = { value: 'visible' };
  /** @type {import('../src/async-handler.js').HandlerOptions | undefined} */
  let received;
  const handler = {
    ...localAsyncHandler,
    get(target, key, receiver, options) {
      received = options;
      return localAsyncHandler.get(target, key, receiver, options);
    },
  };
  const customReflect = makeAsyncReflect(Promise, handler);
  const resultP = customReflect.get({ value: 9 }, 'value', undefined, {
    senderContext: source,
  });
  t.is(await resultP, 9);
  if (received === undefined) {
    t.fail('handler was not called');
    return;
  }
  t.is(received.result, resultP);
  t.is(received.sendMode, 'send');
  t.is(received.harden, 'none');
  t.deepEqual(received.senderContext, { requestId: { value: 'visible' } });
  t.false('inherited' in received.senderContext);
  t.true(Object.isFrozen(received.senderContext));
  t.true(Object.isFrozen(received.senderContext.requestId));
  t.false(Object.isFrozen(source));

  const queuedP = customReflect.get({ value: 10 }, 'value', undefined, {
    senderContext: source,
    sendMode: 'sendOnly',
  });
  t.is(await queuedP, undefined);
  t.is(received.result, queuedP);
  t.is(received.sendMode, 'sendOnly');
});

test('reflect operations defer delivery and reject on normal JavaScript errors', async t => {
  const events = [];
  const target = {
    get method() {
      events.push('get method');
      return () => events.push('call method');
    },
  };
  const resultP = reflect.invoke(target, undefined, 'method', []);
  t.deepEqual(events, []);
  await resultP;
  t.deepEqual(events, ['get method', 'call method']);

  const missingGet = await t.throwsAsync(reflect.get(null, 'x'));
  t.true(missingGet instanceof TypeError);
  const missingCall = await t.throwsAsync(
    reflect.invoke({}, undefined, 'missing', []),
  );
  t.true(missingCall instanceof TypeError);
  const nonCallable = await t.throwsAsync(reflect.apply(3, undefined, []));
  t.true(nonCallable instanceof TypeError);
  const nonObjectHas = await t.throwsAsync(reflect.has(3, 'x'));
  t.true(nonObjectHas instanceof TypeError);
  const nonObjectKeys = await t.throwsAsync(reflect.ownKeys(null));
  t.true(nonObjectKeys instanceof TypeError);
  const nonConstructor = await t.throwsAsync(reflect.construct(() => {}, []));
  t.true(nonConstructor instanceof TypeError);
  const nonObject = await t.throwsAsync(reflect.set(null, 'x', 1));
  t.true(nonObject instanceof TypeError);
});

test('makeAsyncReflect leaves Reflect unchanged', t => {
  t.false('async' in Reflect);
  t.true(Object.isFrozen(reflect));
  t.true(Object.isFrozen(makeAsyncReflect));
  t.false('delete' in reflect);
});
