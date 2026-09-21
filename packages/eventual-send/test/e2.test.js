import test from 'ava';

import { E as TypeE } from '../src/E2.js';
import {
  makePromiseClient,
  makePromiseThenAccessor,
} from '../src/promise-client.js';

const E = makePromiseClient();

const nextTurn = () => new Promise(resolve => setImmediate(resolve));

// Type assertions below document the intended behavior of the typedefs in
// src/E2.js. They are compiler checks for the fluent proxy surface, not runtime
// AVA coverage.
async () => {
  /** @type {Map<number, 'abc' | undefined>} */
  const m = new Map();

  /** @type {null | (() => 'hello')} */
  const fnum = Math.random() < 0.5 ? null : () => 'hello';
  /** @satisfies {string | undefined} */ (await TypeE(Math).min(3, 2).then.Optional.toString());
  /** @satisfies {void} */ (await TypeE.SendOnly(m).set(9, 'abc'));
  /** @satisfies {string | undefined} */ (await TypeE.Optional(2345).toFixed().charAt(3));
  /** @satisfies {'hello' | undefined} */ (await TypeE({ abc: fnum }).abc.then.Optional());
  // @ts-expect-error expression is not callable
  await TypeE({ abc: fnum }).abc();
  /** @satisfies {void} */ (await TypeE.SendOnly(2).toFixed().at(-1));
  {
    const v5This = TypeE(2);
    /** @satisfies {string} */ (await v5This.toExponential());
    const v5Fn = v5This.toExponential;
    // @ts-expect-error void not assignable to type...
    await v5Fn();
    const fakeThis = {
      toExponential: v5Fn,
    };
    // @ts-expect-error the this context of type...
    await fakeThis.toExponential();
  }
  // @ts-expect-error no inherited toString.
  await TypeE(null).toString();
  /** @satisfies {number | undefined} */ (await TypeE.Optional(fnum)().length);
};

test('makePromiseClient creates the E2 surface without mutating Promise', t => {
  t.false('client' in Promise);
  t.is(typeof E, 'function');
  t.false('Once' in E);
  t.is(typeof E.Send, 'function');
  t.is(typeof E.SendOnly, 'function');
  t.is(typeof E.Optional, 'function');

  const node = E({ value: 1 });
  t.is(typeof node.then, 'function');
  t.false('Once' in node.then);
  t.is(typeof node.then.Send, 'function');
  t.is(typeof node.then.SendOnly, 'function');
  t.is(typeof node.then.Optional, 'function');
});

test('E2 client defers thenable and property access', async t => {
  let readThen = false;
  const thenable = {
    get then() {
      readThen = true;
      return resolve => resolve('settled');
    },
  };

  const settledP = E(thenable);
  t.false(readThen);
  await nextTurn();
  t.is(await settledP, 'settled');
  t.true(readThen);

  let readProp = false;
  const obj = {
    get prop() {
      readProp = true;
      return 123;
    },
  };

  const propP = E(obj).prop;
  t.false(readProp);
  t.is(await propP, 123);
  t.true(readProp);
});

test('E2 records property names lazily until get or method call is observed', async t => {
  const events = [];
  const obj = {
    get prop() {
      events.push('get prop');
      return 'value';
    },
    method(arg) {
      events.push(['call method', arg, this]);
      return 'result';
    },
  };

  const propNode = E(obj).prop;
  t.deepEqual(events, []);
  const propValue = await propNode;
  t.is(propValue, 'value');
  t.deepEqual(events, ['get prop']);

  events.length = 0;
  const methodNode = E(obj).method('arg');
  t.deepEqual(events, []);
  t.is(await methodNode, 'result');
  t.deepEqual(events, [['call method', 'arg', obj]]);
});

test('E2 default rejects pipelining past one property', async t => {
  const obj = {
    prop1: {
      prop2: 'value',
    },
  };

  await t.throwsAsync(() => E(obj).prop1.prop2, {
    instanceOf: TypeError,
    message: /^Cannot pipeline further/,
  });
});

test('E2 Send lazy property cache is one property deep', async t => {
  const events = [];
  const obj = {
    get prop1() {
      events.push('get prop1');
      return {
        get prop2() {
          events.push('get prop2');
          return 'value';
        },
      };
    },
  };

  const prop1Node = E.Send(obj).prop1;
  t.deepEqual(events, []);

  const prop2Node = prop1Node.prop2;
  t.deepEqual(events, []);

  await nextTurn();
  t.deepEqual(events, ['get prop1']);

  const prop2Value = await prop2Node;
  t.is(prop2Value, 'value');
  t.deepEqual(events, ['get prop1', 'get prop2']);
});

test('E2 default gets, applies, and invokes one step', async t => {
  const obj = {
    name: 'buddy',
    value: 123,
    hello(greeting) {
      return `${greeting}, ${this.name}!`;
    },
  };

  await nextTurn();
  t.is(await E(obj).value, 123);
  t.is(await E(n => n * 2)(21), 42);
  t.is(await E(obj).hello('Hello'), 'Hello, buddy!');
});

test('E2 default method proxies reject wrong receivers', async t => {
  const obj = {
    value: 3,
    double() {
      return this.value * 2;
    },
  };
  const node = E(obj);
  const double = node.double;

  await t.throwsAsync(() => double(), { instanceOf: TypeError });
  await t.throwsAsync(() => double.call(obj), {
    instanceOf: TypeError,
    message: /^Cannot pipeline further/,
  });
  t.is(await node.double(), 6);
});

test('E2 Send chains explicitly', async t => {
  const obj = {
    a: {
      b: {
        c(n) {
          return n * 3;
        },
      },
    },
  };

  await nextTurn();
  t.is(await E.Send(obj).a.b.c(7), 21);
  t.is(await E(obj).a.then.Send.b.c(8), 24);
});

test('E2 then accessor ponyfill creates installable then controls', async t => {
  const descriptor = makePromiseThenAccessor(Promise, E);
  t.is(typeof descriptor.get, 'function');
  const getThen = descriptor.get;
  if (typeof getThen !== 'function') {
    throw TypeError('expected a then accessor getter');
  }

  const then = getThen.call(
    Promise.resolve({
      a: {
        b: {
          c() {
            return 42;
          },
        },
      },
    }),
  );

  t.is(typeof then, 'function');
  t.is(typeof then.Send, 'function');
  t.is(typeof then.SendOnly, 'function');
  t.is(typeof then.Optional, 'function');
  t.false('Once' in then);
  const result = await then.Send.a.b.c();
  t.is(result, 42);
});

test('E2 Optional short-circuits the remaining chain', async t => {
  await nextTurn();
  t.is(await E.Optional(null).a, undefined);
  t.is(await E.Optional(undefined).a, undefined);
  t.is(await E.Optional(undefined).then.Optional.a, undefined);
  t.is(await E.Optional(null).a.b(), undefined);
  t.is(await E.Optional(undefined).a.b(), undefined);
  t.is(await E.Optional(undefined).then.Optional.a.b(), undefined);

  const obj = {
    a: {
      b() {
        return 'present';
      },
    },
  };
  t.is(await E.Optional(obj).a.b(), 'present');
});

test('E2 Optional mirrors per-step optional chaining', async t => {
  const present = {
    method() {
      return {
        toString() {
          return 'done';
        },
      };
    },
  };
  const presentResult =
    await E(present).then.Optional.method.then.Optional().then.Optional.toString();
  t.is(presentResult, 'done');

  t.is(
    await E(null).then.Optional.method.then.Optional().then.Optional.toString(),
    undefined,
  );
  t.is(
    await E({ method: undefined }).then.Optional.method.then.Optional(
      'ignored',
    ).then.Optional.toString(),
    undefined,
  );
  t.is(
    await E({ method: () => null }).then.Optional.method.then.Optional()
      .then.Optional.toString(),
    undefined,
  );
});

test('E2 SendOnly resolves when queued and suppresses operation failures', async t => {
  let count = 0;
  /** @type {(value?: unknown) => void} */
  let resolveIncrDone;
  const incrDone = new Promise(resolve => {
    resolveIncrDone = resolve;
  });
  const counter = {
    incr(n) {
      count += n;
      resolveIncrDone();
      return count;
    },
  };

  const resultP = E.SendOnly(counter).incr(5);
  t.is(count, 0);
  const result = await resultP;
  t.is(result, undefined);
  await incrDone;
  t.is(count, 5);

  t.is(await E.SendOnly(null).incr(1), undefined);
});

test('E2 uses normal lookup for primitives and inherited properties', async t => {
  await nextTurn();
  t.is(await E(2345).toFixed(), '2345');
  t.is(await E('abc').charAt(1), 'b');
  t.is(await E({}).toString(), '[object Object]');
  await t.throwsAsync(() => E(null).toString(), {
    instanceOf: TypeError,
  });
});

test('E2 hardens client and then-control surfaces', t => {
  t.true(Object.isFrozen(E));
  t.true(Object.isFrozen(E.Send));
  t.true(Object.isFrozen(E.SendOnly));
  t.true(Object.isFrozen(E.Optional));

  for (const key of ['Send', 'SendOnly', 'Optional']) {
    const descriptor = Object.getOwnPropertyDescriptor(E, key);
    t.like(descriptor, {
      configurable: false,
      enumerable: false,
      writable: false,
    });
  }

  const nodeThen = E({}).then;
  t.true(Object.isFrozen(nodeThen));
  for (const key of ['Send', 'SendOnly', 'Optional']) {
    const descriptor = Object.getOwnPropertyDescriptor(nodeThen, key);
    t.is(typeof descriptor?.get, 'function');
    t.false(descriptor?.enumerable);
    t.false(descriptor?.configurable);
  }

  const thenDescriptor = makePromiseThenAccessor(Promise, E);
  t.true(Object.isFrozen(thenDescriptor));
  t.false(thenDescriptor.enumerable);
  t.true(thenDescriptor.configurable);
  t.is(typeof thenDescriptor.get, 'function');
});
