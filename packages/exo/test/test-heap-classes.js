// eslint-disable-next-line import/order
import { test } from './prepare-test-env-ava.js';

// eslint-disable-next-line import/order
import { M } from '@endo/patterns';
import {
  defineExoClass,
  defineExoClassKit,
  makeExo,
} from '../src/exo-makers.js';
import { GET_INTERFACE_GUARD } from '../src/exo-tools.js';

const { ownKeys } = Reflect;

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
  t.deepEqual(ownKeys(UpCounterI.methodGuards), ['incr']);
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
  t.throws(() => greeterMaker[GET_INTERFACE_GUARD](), {
    message: 'greeterMaker[GET_INTERFACE_GUARD] is not a function',
  });
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
      makeExo('greeter', EmptyGreeterI, {
        sayHello() {
          return 'hello';
        },
      }),
    { message: 'methods ["sayHello"] not guarded by "greeter"' },
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
      'thisful method "In \\"[Symbol(getInterfaceGuard)]\\" method of (greeter)" called without \'this\' object',
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

  // TODO when there is an interface, error if a method is missing from it
  const guarded = makeExo('upCounter', UpCounterI, {
    /** @param {number} val */
    incr(val) {
      return val;
    },
    notInInterface() {
      return 0;
    },
  });
  // @ts-expect-error invalid args
  guarded.incr();
  guarded.notInInterface();
  // @ts-expect-error not defined
  guarded.notInBehavior;
});
