/* eslint-disable no-unused-vars, no-underscore-dangle */
/// <reference types="ses"/>

// eslint-disable-next-line prettier/prettier
import type { __LiveExportsMap__, __FixedExportsMap__ } from 'ses';

lockdown();
lockdown({});
lockdown({ errorTaming: 'unsafe' });
lockdown({
  mathTaming: 'unsafe',
  dateTaming: 'unsafe',
  errorTaming: 'unsafe',
  localeTaming: 'unsafe',
  consoleTaming: 'unsafe',
  stackFiltering: 'verbose',
  overrideTaming: 'moderate',
  overrideDebug: ['ponies'],
  __allowUnsafeMonkeyPatching__: 'unsafe',
});

// @ts-expect-error
lockdown({ mode: 'BOSS' });

const { x, y } = harden({ x: 4, y: 3 });
const h: number = (x ** 2 + y ** 2) ** 0.5;

// @ts-expect-error
const { z, w } = harden({ x: 3, y: 4 });

const c = new Compartment();
c.evaluate('10');

// @ts-expect-error
Compartment();

const transforms = [(source: string) => source];
const globals = {b: 20};
const globalLexicals = {a: 10};
const moduleMap = {
  'direct': 'redirect',
  'internal': {d: 40},
};
const moduleMapHook = (specifier: string) => {
  if (Math.random() < 0.5) {
    return 'redirect';
  } else if (Math.random() < 0.5) {
    return {c: 30};
  }
  return undefined;
};

const resolveHook = (importSpecifier: string, referrerSpecifier: string) => importSpecifier;

const __liveExportsMap__: __LiveExportsMap__ = {a: ['b', false], c: ['d', true]};
const __fixedExportsMap__: __FixedExportsMap__ = {d: ['e']};

const importHook = async (specifier: string) => {
  return {
    imports: ['x'],
    exports: ['y'],
    reexports: ['z'],
    __syncModuleProgram__: '',
    __liveExportsMap__,
    __fixedExportsMap__,
  };
};

const d = new Compartment(globals, moduleMap, {
  name: 'compartment',
  transforms,
  globalLexicals,
  moduleMapHook,
  importHook,
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

const { quote: q, details: X } = assert;

assert.equal('a', 'b');
assert.equal('a', 'b', 'equality error');
assert.equal('a', 'b', X`equality error left:${q('a')}, right:${q('b')}`);

assert.typeof(10.1, 'number');
assert.typeof(10n, 'bigint');
assert.typeof(false, 'boolean');
assert.typeof(()=>{}, 'function');
assert.typeof({}, 'object');
assert.typeof('Hello, World!\n', 'string');
assert.typeof(Symbol.for('poke'), 'symbol');
assert.typeof(undefined, 'undefined');

assert.typeof(10.1, 'number', 'not a number');
assert.typeof(10n, 'bigint', 'unbigint');
assert.typeof(false, 'boolean', 'not a boolean');
assert.typeof(()=>{}, 'function', 'not a function');
assert.typeof({}, 'object', 'not an object');
assert.typeof('Hello, World!\n', 'string', 'string error');
assert.typeof(Symbol.for('poke'), 'symbol', 'symbol error');
assert.typeof(undefined, 'undefined', 'undefined error');

assert.typeof(10.1, 'number', X`n: ${q(10.1)}`);
assert.typeof(10n, 'bigint', X`n: ${q(10n)}`);
assert.typeof(false, 'boolean', X`b: ${q(false)}`);
assert.typeof(()=>{}, 'function', X`f: ${q(()=>{})}`);
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

assert.note(new Error('nothing to see here'), X`except this ${q('detail')}`);

X`canst thou string?`.toString();

const f = (value: any) => {
  throw assert.error(X`details are ${q(value)}`);
};

const g = (value: any) => {
  assert.fail(X`details are ${q(value)}`);
};

const nonfatal = assert.makeAssert(() => {}, true);
nonfatal(false, 'definitely nonfatal');
