import test from 'ava';

import { E as TypeE } from '../src/E2.js';
import { makePromiseClient } from '../src/e2-shim.js';

const E = makePromiseClient();

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
  t.is(E.Once, E);
  t.is(typeof E.Send, 'function');
  t.is(typeof E.SendOnly, 'function');
  t.is(typeof E.Optional, 'function');

  const node = E({ value: 1 });
  t.is(typeof node.then, 'function');
  t.is(typeof node.then.Once, 'function');
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
  await null;
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

test('E2 Once gets, applies, and invokes one step', async t => {
  const obj = {
    name: 'buddy',
    value: 123,
    hello(greeting) {
      return `${greeting}, ${this.name}!`;
    },
  };

  await null;
  t.is(await E(obj).value, 123);
  t.is(await E(n => n * 2)(21), 42);
  t.is(await E(obj).hello('Hello'), 'Hello, buddy!');
  t.is(await E.Once(obj).hello('Hi'), 'Hi, buddy!');
});

test('E2 Once method proxies reject wrong receivers', async t => {
  const obj = {
    value: 3,
    double() {
      return this.value * 2;
    },
  };
  const node = E(obj);
  const double = node.double;

  await t.throwsAsync(() => double(), { instanceOf: TypeError });
  await t.throwsAsync(() => double.call(obj), { instanceOf: TypeError });
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

  await null;
  t.is(await E.Send(obj).a.b.c(7), 21);
  t.is(await E(obj).a.then.Send.b.c(8), 24);
});

test('E2 Optional short-circuits the remaining chain', async t => {
  await null;
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
  const counter = {
    incr(n) {
      count += n;
      return count;
    },
  };

  const resultP = E.SendOnly(counter).incr(5);
  t.is(count, 0);
  const result = await resultP;
  t.is(result, undefined);
  await null;
  t.is(count, 5);

  t.is(await E.SendOnly(null).incr(1), undefined);
});
