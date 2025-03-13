/* eslint-disable @endo/no-polymorphic-call, import/no-extraneous-dependencies, no-restricted-globals, no-underscore-dangle */
import { expectType } from 'tsd';
import type { Assert } from 'ses';

import { equal as nassert } from 'node:assert/strict';

// Lockdown

lockdown();
lockdown({});
lockdown({ errorTaming: 'unsafe' });
lockdown({
  errorTaming: 'unsafe',
  localeTaming: 'unsafe',
  consoleTaming: 'unsafe',
  stackFiltering: 'verbose',
  overrideTaming: 'moderate',
  overrideDebug: ['ponies'],
});

// @ts-expect-error
lockdown({ mode: 'BOSS' });

// ////////////////////////////////////////////////////////////////////////

// Harden

const { x, y } = harden({ x: 4, y: 3 });
const h: number = (x ** 2 + y ** 2) ** 0.5;

// @ts-expect-error
const { z, w } = harden({ x: 3, y: 4 });

// ////////////////////////////////////////////////////////////////////////

// Compartments

const c = new Compartment();
c.evaluate('10');

// @ts-expect-error
Compartment();

const transforms = [(source: string) => source];
const globals = { b: 20 };
const moduleMap = {
  direct: 'redirect',
  internal: { d: 40 },
};

const resolveHook = (importSpecifier: string, referrerSpecifier: string) =>
  importSpecifier;

const d = new Compartment(globals, moduleMap, {
  name: 'compartment',
  transforms,
  resolveHook,
  __shimTransforms__: transforms,
});

d.name === 'compartment';

// @ts-expect-error
d.name = 'alternate';

d.globalThis.endowment = {};

// @ts-expect-error
d.globalThis = {};

d.load('x').then(() => {});

d.import('x').then(exports => {});

d.importNow('y');

d.module('z');

// ////////////////////////////////////////////////////////////////////////

// Assertions

const {
  Fail,
  quote: q,
  details: X,
  error: makeError,
  note: annotateError,
} = assert;

assert.equal('a', 'b');
assert.equal('a', 'b', 'equality error');
assert.equal('a', 'b', X`equality error left:${q('a')}, right:${q('b')}`);
{
  // narrowing
  type NumRecord = { key: 'num'; value: number };
  type StrRecord = { key: 'str'; value: string };
  const r: NumRecord | StrRecord = null as any;
  expectType<string | number>(r.value);
  assert.equal(r.key, 'str');
  expectType<string>(r.value);
}

assert.typeof(10.1, 'number');
assert.typeof(10n, 'bigint');
assert.typeof(false, 'boolean');
assert.typeof(() => {}, 'function');
assert.typeof({}, 'object');
assert.typeof('Hello, World!\n', 'string');
assert.typeof(Symbol.for('poke'), 'symbol');
assert.typeof(undefined, 'undefined');

assert.typeof(10.1, 'number', 'not a number');
assert.typeof(10n, 'bigint', 'unbigint');
assert.typeof(false, 'boolean', 'not a boolean');
assert.typeof(() => {}, 'function', 'not a function');
assert.typeof({}, 'object', 'not an object');
assert.typeof('Hello, World!\n', 'string', 'string error');
assert.typeof(Symbol.for('poke'), 'symbol', 'symbol error');
assert.typeof(undefined, 'undefined', 'undefined error');

assert.typeof(10.1, 'number', X`n: ${q(10.1)}`);
assert.typeof(10n, 'bigint', X`n: ${q(10n)}`);
assert.typeof(false, 'boolean', X`b: ${q(false)}`);
assert.typeof(() => {}, 'function', X`f: ${q(() => {})}`);
assert.typeof({}, 'object', X`o: ${q({})}`);
assert.typeof('Hello, World!\n', 'string', X`s: ${q('Hi')}`);
assert.typeof(Symbol.for('poke'), 'symbol', X`y: ${q(Symbol.for('boop'))}`);
assert.typeof(undefined, 'undefined', X`u: ${q(undefined)}`);

// @ts-expect-error
assert.typeof(null, 'sprocket');

// @ts-expect-error
assert.typeof(null, 'string', 10);

// Opaque token
assert.typeof(null, 'string', {});

assert.string('i am a string');
assert.string(0x535176, 'not a string');
assert.string(0x535176, X`should have been a string ${10}`);

// ////////////////////////////////////////////////////////////////////////

// Verify type assertions.

interface Dummy {
  crash(): void;
}

(dummy?: Dummy) => {
  // @ts-expect-error
  dummy.crash();
};
// vs
(dummy?: Dummy) => {
  assert(dummy);
  dummy.crash();
};

(n: number | bigint) => {
  // @ts-expect-error
  // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
  return n + 10n;
};
// vs
(n: number | bigint) => {
  assert.typeof(n, 'bigint');
  return n + 10n;
};
// or
(n: number | bigint) => {
  assert.typeof(n, 'number');
  return n + 10;
};

(n: number | string) => {
  // @ts-expect-error
  // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
  return n + 10;
};
// vs
(n: number | string) => {
  assert.typeof(n, 'number');
  return n + 10;
};

(s: string | null) => {
  // @ts-expect-error
  return s.concat(', hi!');
};
// vs
(s: string | null) => {
  assert.typeof(s, 'string');
  return s.concat(', hi!');
};
// or
(s: string | null) => {
  assert.string(s);
  return s.concat(', hi!');
};

// ////////////////////////////////////////////////////////////////////////

// Reasserting itself

const assume: Assert = assert.makeAssert(() => {}, true);
expectType<void>(assume(false, 'definitely'));

// ////////////////////////////////////////////////////////////////////////

annotateError(Error('nothing to see here'), X`except this ${q('detail')}`);

X`canst thou string?`.toString();

const stringable = q(null);

expectType<Error>(makeError(X`details are ${q(stringable)}`));

expectType<Error>(makeError(X`details are ${stringable}`, TypeError));

expectType<Error>(
  makeError(X`details are ${stringable}`, TypeError, {
    errorName: 'Nom de plum',
  }),
);

expectType<never>(assert.fail(X`details are ${stringable}`));

// eslint-disable-next-line no-unreachable
expectType<never>(Fail`details are ${stringable}`);
