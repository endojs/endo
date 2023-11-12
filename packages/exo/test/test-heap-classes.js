// @ts-check
// eslint-disable-next-line import/order
import { test } from './prepare-test-env-ava.js';

// eslint-disable-next-line import/order
import { getInterfaceMethodKeys, M } from '@endo/patterns';
import {
  GET_INTERFACE_GUARD,
  defineExoClass,
  defineExoClassKit,
  makeExo,
} from '../index.js';

const NoExtraI = M.interface('NoExtra', {
  foo: M.call().returns(),
});

test('what happens with extra arguments', t => {
  const exo = makeExo('WithExtra', NoExtraI, {
    foo(x) {
      t.is(x, undefined);
    },
  });
  exo.foo('an extra arg');
});

const OptionalArrayI = M.interface('OptionalArray', {
  foo: M.callWhen().optional(M.arrayOf(M.any())).returns(),
});

test('callWhen-guarded method called without optional array argument', async t => {
  const exo = makeExo('WithNoOption', OptionalArrayI, {
    async foo(arr) {
      t.is(arr, undefined);
    },
  });
  await t.notThrowsAsync(() => exo.foo());
});

const UpCounterI = M.interface('UpCounter', {
  incr: M.call()
    // TODO M.number() should not be needed to get a better error message
    .optional(M.and(M.number(), M.gte(0)))
    .returns(M.number()),
});

const DownCounterI = M.interface('DownCounter', {
  decr: M.call()
    // TODO M.number() should not be needed to get a better error message
    .optional(M.and(M.number(), M.gte(0)))
    .returns(M.number()),
});

test('test defineExoClass', t => {
  const makeUpCounter = defineExoClass(
    'UpCounter',
    UpCounterI,
    /** @param {number} x */
    (x = 0) => ({ x }),
    {
      incr(y = 1) {
        const { state } = this;
        state.x += y;
        return state.x;
      },
    },
  );
  const upCounter = makeUpCounter(3);
  t.is(upCounter.incr(5), 8);
  t.is(upCounter.incr(1), 9);
  t.throws(() => upCounter.incr(-3), {
    message: 'In "incr" method of (UpCounter): arg 0?: -3 - Must be >= 0',
  });
  // @ts-expect-error bad arg
  t.throws(() => upCounter.incr('foo'), {
    message:
      'In "incr" method of (UpCounter): arg 0?: string "foo" - Must be a number',
  });
  t.deepEqual(upCounter[GET_INTERFACE_GUARD](), UpCounterI);
  t.deepEqual(getInterfaceMethodKeys(UpCounterI), ['incr']);

  const symbolic = Symbol.for('symbolic');
  const FooI = M.interface('Foo', {
    m: M.call().returns(),
    [symbolic]: M.call(M.boolean()).returns(),
  });
  t.deepEqual(getInterfaceMethodKeys(FooI), ['m', Symbol.for('symbolic')]);
  const makeFoo = defineExoClass('Foo', FooI, () => ({}), {
    m() {},
    [symbolic]() {},
  });
  const foo = makeFoo();
  t.deepEqual(foo[GET_INTERFACE_GUARD](), FooI);
  // @ts-expect-error intentional for test
  t.throws(() => foo[symbolic]('invalid arg'), {
    message:
      'In "[Symbol(symbolic)]" method of (Foo): arg 0: string "invalid arg" - Must be a boolean',
  });
});

test('test defineExoClassKit', t => {
  const makeCounterKit = defineExoClassKit(
    'Counter',
    { up: UpCounterI, down: DownCounterI },
    /** @param {number} x */
    (x = 0) => ({ x }),
    {
      up: {
        incr(y = 1) {
          // @ts-expect-error methods not on this
          this.incr;
          // @ts-expect-error facets not on this
          this.up;
          assert(this.facets.up.incr, 'facets.up.incr exists');
          const { state } = this;
          state.x += y;
          return state.x;
        },
      },
      down: {
        decr(y = 1) {
          const { state } = this;
          state.x -= y;
          return state.x;
        },
      },
    },
  );
  const { up: upCounter, down: downCounter } = makeCounterKit(3);
  t.is(upCounter.incr(5), 8);
  t.is(downCounter.decr(), 7);
  t.is(upCounter.incr(3), 10);
  t.throws(() => upCounter.incr(-3), {
    message: 'In "incr" method of (Counter up): arg 0?: -3 - Must be >= 0',
  });
  // @ts-expect-error the type violation is what we're testing
  t.throws(() => downCounter.decr('foo'), {
    message:
      'In "decr" method of (Counter down): arg 0?: string "foo" - Must be a number',
  });
  // @ts-expect-error bad arg
  t.throws(() => upCounter.decr(3), {
    message: 'upCounter.decr is not a function',
  });
  t.deepEqual(upCounter[GET_INTERFACE_GUARD](), UpCounterI);
  t.deepEqual(downCounter[GET_INTERFACE_GUARD](), DownCounterI);
});

test('test makeExo', t => {
  let x = 3;
  const upCounter = makeExo('upCounter', UpCounterI, {
    incr(y = 1) {
      x += y;
      return x;
    },
  });
  t.is(upCounter.incr(5), 8);
  t.is(upCounter.incr(1), 9);
  t.throws(() => upCounter.incr(-3), {
    message: 'In "incr" method of (upCounter): arg 0?: -3 - Must be >= 0',
  });
  // @ts-expect-error deliberately bad arg for testing
  t.throws(() => upCounter.incr('foo'), {
    message:
      'In "incr" method of (upCounter): arg 0?: string "foo" - Must be a number',
  });
  t.deepEqual(upCounter[GET_INTERFACE_GUARD](), UpCounterI);
});

// For code sharing with defineKind which does not support an interface
test('missing interface', t => {
  t.notThrows(() =>
    makeExo('greeter', undefined, {
      sayHello() {
        return 'hello';
      },
    }),
  );
  const greeterMaker = makeExo('greeterMaker', undefined, {
    makeSayHello() {
      return () => 'hello';
    },
  });
  t.throws(() => greeterMaker.makeSayHello(), {
    message:
      'In "makeSayHello" method of (greeterMaker): result: "[Symbol(passStyle)]" property expected: "[Function <anon>]"',
  });
  t.is(greeterMaker[GET_INTERFACE_GUARD](), undefined);
});

const SloppyGreeterI = M.interface('greeter', {}, { sloppy: true });
const EmptyGreeterI = M.interface('greeter', {}, { sloppy: false });

test('sloppy option', t => {
  const greeter = makeExo('greeter', SloppyGreeterI, {
    sayHello() {
      return 'hello';
    },
  });
  t.is(greeter.sayHello(), 'hello');
  t.deepEqual(greeter[GET_INTERFACE_GUARD](), SloppyGreeterI);

  t.throws(
    () =>
      makeExo(
        'greeter',
        // @ts-expect-error missing guard
        EmptyGreeterI,
        {
          sayHello() {
            return 'hello';
          },
        },
      ),
    { message: 'methods ["sayHello"] not guarded by "greeter"' },
  );
});

const makeBehavior = () => ({
  behavior() {
    return 'something';
  },
});

const PassableGreeterI = M.interface(
  'greeter',
  {},
  { defaultGuards: 'passable' },
);
test('passable guards', t => {
  const greeter = makeExo('greeter', PassableGreeterI, {
    sayHello(immutabe) {
      t.is(Object.isFrozen(immutabe), true);
      return 'hello';
    },
  });

  const mutable = {};
  t.is(greeter.sayHello(mutable), 'hello', `passableGreeter can sayHello`);
  t.is(Object.isFrozen(mutable), true, `mutable is frozen`);
  t.throws(() => greeter.sayHello(makeBehavior()), {
    message:
      /In "sayHello" method of \(greeter\): Remotables must be explicitly declared/,
  });
});

const RawGreeterI = M.interface('greeter', {}, { defaultGuards: 'raw' });

const testGreeter = (t, greeter, msg) => {
  const mutable = {};
  t.is(greeter.sayHello(mutable), 'hello', `${msg} can sayHello`);
  t.deepEqual(mutable, { x: 3 }, `${msg} mutable is mutated`);
  mutable.y = 4;
  t.deepEqual(mutable, { x: 3, y: 4 }, `${msg} mutable is mutated again}`);
};

test('raw guards', t => {
  const greeter = makeExo('greeter', RawGreeterI, {
    sayHello(mutable) {
      mutable.x = 3;
      return 'hello';
    },
  });
  t.deepEqual(greeter[GET_INTERFACE_GUARD](), RawGreeterI);
  testGreeter(t, greeter, 'raw defaultGuards');

  const Greeter2I = M.interface('greeter2', {
    sayHello: M.call(M.raw()).returns(M.string()),
    rawIn: M.call(M.raw()).returns(M.any()),
    rawOut: M.call(M.any()).returns(M.raw()),
    passthrough: M.call(M.raw()).returns(M.raw()),
    tortuous: M.call(M.any(), M.raw(), M.any())
      .optional(M.any(), M.raw())
      .returns(M.any()),
  });
  const greeter2 = makeExo('greeter2', Greeter2I, {
    sayHello(mutable) {
      mutable.x = 3;
      return 'hello';
    },
    rawIn(obj) {
      t.is(Object.isFrozen(obj), false);
      return obj;
    },
    rawOut(obj) {
      t.is(Object.isFrozen(obj), true);
      return { ...obj };
    },
    passthrough(obj) {
      t.is(Object.isFrozen(obj), false);
      return obj;
    },
    tortuous(hardA, softB, hardC, optHardD, optSoftE = {}) {
      // Test that `M.raw()` does not freeze the arguments, unlike `M.any()`.
      t.is(Object.isFrozen(hardA), true);
      t.is(Object.isFrozen(softB), false);
      softB.b = 2;
      t.is(Object.isFrozen(hardC), true);
      t.is(Object.isFrozen(optHardD), true);
      t.is(Object.isFrozen(optSoftE), false);
      return {};
    },
  });
  t.deepEqual(greeter2[GET_INTERFACE_GUARD](), Greeter2I);
  testGreeter(t, greeter, 'explicit raw');

  t.is(Object.isFrozen(greeter2.rawIn({})), true);
  t.is(Object.isFrozen(greeter2.rawOut({})), false);
  t.is(Object.isFrozen(greeter2.passthrough({})), false);

  t.is(Object.isFrozen(greeter2.tortuous({}, {}, {}, {}, {})), true);
  t.is(Object.isFrozen(greeter2.tortuous({}, {}, {})), true);

  t.throws(
    () => greeter2.tortuous(makeBehavior(), {}, {}),
    {
      message:
        /In "tortuous" method of \(greeter2\): Remotables must be explicitly declared/,
    },
    'passable behavior not allowed',
  );
  t.notThrows(
    () => greeter2.tortuous({}, makeBehavior(), {}),
    'raw behavior allowed',
  );
});

const GreeterI = M.interface('greeter', {
  sayHello: M.call().returns('hello'),
});

test('naked function call', t => {
  const greeter = makeExo('greeter', GreeterI, {
    sayHello() {
      return 'hello';
    },
  });

  const { sayHello, [GET_INTERFACE_GUARD]: gigm } = greeter;
  t.throws(() => sayHello(), {
    message:
      'thisful method "In \\"sayHello\\" method of (greeter)" called without \'this\' object',
  });
  t.is(sayHello.bind(greeter)(), 'hello');

  t.throws(() => gigm(), {
    message:
      'thisful method "In \\"__getInterfaceGuard__\\" method of (greeter)" called without \'this\' object',
  });
  t.deepEqual(gigm.bind(greeter)(), GreeterI);
});

// needn't run. we just don't have a better place to write these.
test.skip('types', () => {
  // any methods can be defined if there's no interface
  const unguarded = makeExo('upCounter', undefined, {
    /** @param {number} val */
    incr(val) {
      return val;
    },
    notInInterface() {
      return 0;
    },
  });
  // @ts-expect-error invalid args
  unguarded.incr();
  unguarded.notInInterface();
  // @ts-expect-error not defined
  unguarded.notInBehavior;

  const guarded = makeExo('upCounter', UpCounterI, {
    /** @param {number} val */
    incr(val) {
      return val;
    },
  });
  // @ts-expect-error invalid args
  guarded.incr();
  // @ts-expect-error not defined
  guarded.notInBehavior;

  makeExo(
    'upCounter',
    // @ts-expect-error Property 'notInInterface' is missing from UpCounterI
    UpCounterI,
    {
      /** @param {number} val */
      incr(val) {
        return val;
      },
      notInInterface() {
        return 0;
      },
    },
  );

  const sloppy = makeExo(
    'upCounter',
    M.interface(
      'UpCounter',
      {
        incr: M.call().optional(M.number()).returns(M.number()),
      },
      { sloppy: true },
    ),
    {
      /** @param {number} val */
      incr(val) {
        return val;
      },
      notInInterface() {
        return 0;
      },
    },
  );
  sloppy.incr(1);
  // @ts-expect-error invalid args
  sloppy.incr();
  // allowed because sloppy:true
  sloppy.notInInterface() === 0;
  // @ts-expect-error TS infers it's literally 0
  sloppy.notInInterface() === 1;
});
