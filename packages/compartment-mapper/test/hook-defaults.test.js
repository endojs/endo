import './ses-lockdown.js';
import test from 'ava';
import { applyHookDefaults } from '../src/hook.js';

test('applyHookDefaults - basic object merging', t => {
  const target = { a: 1 };
  const source = { b: 2 };
  const result = applyHookDefaults(target, source);

  t.is(result, target, 'should return the target object');
  t.deepEqual(result, { a: 1, b: 2 }, 'should merge properties');
});

test('applyHookDefaults - does not override existing values', t => {
  const target = { a: 1, b: 2 };
  const source = { a: 10, c: 3 };
  const result = applyHookDefaults(target, source);

  t.deepEqual(
    result,
    { a: 1, b: 2, c: 3 },
    'should not override existing values',
  );
});

test('applyHookDefaults - handles null and undefined in target', t => {
  const target = { a: null, b: undefined, c: 3 };
  const source = { a: 1, b: 2, d: 4 };
  const result = applyHookDefaults(target, source);

  t.deepEqual(
    result,
    { a: 1, b: 2, c: 3, d: 4 },
    'should replace null and undefined values',
  );
});

test('applyHookDefaults - deep merging of nested objects', t => {
  const target = {
    a: {
      x: 1,
      y: { z: 2 },
    },
    b: 3,
  };
  const source = {
    a: {
      y: { w: 4 },
      z: 5,
    },
    c: 6,
  };
  const result = applyHookDefaults(target, source);

  t.deepEqual(
    result,
    {
      a: {
        x: 1,
        y: { z: 2, w: 4 },
        z: 5,
      },
      b: 3,
      c: 6,
    },
    'should deeply merge nested objects',
  );
});

test('applyHookDefaults - merge arrays', t => {
  const target = { a: [1, 2] };
  const source = { a: [3, 4], b: [5, 6] };
  const result = applyHookDefaults(target, source);

  t.deepEqual(
    result,
    { a: [3, 4, 1, 2], b: [5, 6] },
    'should not merge arrays, preserve existing',
  );
});

test('applyHookDefaults - handles null values in target and source', t => {
  const target = { a: null };
  const source = { a: { x: 1 }, b: null };
  const result = applyHookDefaults(target, source);

  t.deepEqual(
    result,
    { a: { x: 1 }, b: null },
    'should handle null values correctly',
  );
});

test('applyHookDefaults - multiple sources', t => {
  const target = { a: 1 };
  const source1 = { b: 2, c: { x: 1 } };
  const source2 = { c: { y: 2 }, d: 4 };
  const source3 = { c: { z: 3 }, e: 5 };
  const result = applyHookDefaults(target, source1, source2, source3);

  t.deepEqual(
    result,
    {
      a: 1,
      b: 2,
      c: { x: 1, y: 2, z: 3 },
      d: 4,
      e: 5,
    },
    'should merge multiple sources from left to right',
  );
});

test('applyHookDefaults - handles primitive target', t => {
  const result1 = applyHookDefaults(null, { a: 1 });
  const result2 = applyHookDefaults(undefined, { a: 1 });
  const result3 = applyHookDefaults(42, { a: 1 });
  const result4 = applyHookDefaults('string', { a: 1 });

  t.is(result1, null, 'should return null for null target');
  t.deepEqual(
    result2,
    { a: 1 },
    'should create object and merge for undefined target',
  );
  t.is(result3, 42, 'should return number for number target');
  t.is(result4, 'string', 'should return string for string target');
});

test('applyHookDefaults - undefined target with multiple sources', t => {
  const source1 = { a: 1, nested: { x: 1 } };
  const source2 = { b: 2, nested: { y: 2 } };
  const source3 = { c: 3, nested: { z: 3 } };

  const result = applyHookDefaults(undefined, source1, source2, source3);

  t.deepEqual(
    result,
    {
      a: 1,
      b: 2,
      c: 3,
      nested: { x: 1, y: 2, z: 3 },
    },
    'should create object from undefined and merge all sources',
  );

  t.true(typeof result === 'object', 'should return an object');
  t.false(result === source1, 'should not return the first source directly');
});

test('applyHookDefaults - undefined target with no sources', t => {
  const result = applyHookDefaults(undefined);

  t.deepEqual(
    result,
    {},
    'should return empty object for undefined target with no sources',
  );
  t.true(typeof result === 'object', 'should return an object');
});

test('applyHookDefaults - handles null/undefined sources', t => {
  const target = { a: 1 };
  const result = applyHookDefaults(target, null, undefined, { b: 2 });

  t.deepEqual(result, { a: 1, b: 2 }, 'should skip null/undefined sources');
});

test('applyHookDefaults - empty objects', t => {
  const target = {};
  const source = {};
  const result = applyHookDefaults(target, source);

  t.deepEqual(result, {}, 'should handle empty objects');
  t.is(result, target, 'should return the target object');
});

test('applyHookDefaults - complex nested structure', t => {
  const target = {
    level1: {
      a: 1,
      level2: {
        b: 2,
        level3: {
          c: 3,
        },
      },
    },
    existing: 'keep',
  };

  const source = {
    level1: {
      level2: {
        level3: {
          d: 4,
        },
        e: 5,
      },
      f: 6,
    },
    new: 'add',
  };

  const result = applyHookDefaults(target, source);

  t.deepEqual(
    result,
    {
      level1: {
        a: 1,
        level2: {
          b: 2,
          level3: {
            c: 3,
            d: 4,
          },
          e: 5,
        },
        f: 6,
      },
      existing: 'keep',
      new: 'add',
    },
    'should handle complex nested structures',
  );
});

test('applyHookDefaults - function values', t => {
  const fn1 = () => 'fn1';
  const fn2 = () => 'fn2';
  const target = { a: fn1 };
  const source = { a: fn2, b: fn2 };
  const result = applyHookDefaults(target, source);

  t.is(result.a, fn1, 'should preserve existing function');
  t.is(result.b, fn2, 'should add new function');
});

test('applyHookDefaults - mixed data types', t => {
  const target = {
    string: 'existing',
    number: undefined,
    boolean: true,
    object: { a: 1 },
    array: null,
  };

  const source = {
    string: 'new',
    number: 42,
    boolean: false,
    object: { b: 2 },
    array: [1, 2, 3],
    date: new Date('2023-01-01'),
  };

  const result = applyHookDefaults(target, source);

  t.is(result.string, 'existing', 'should preserve existing string');
  t.is(result.number, 42, 'should set undefined number');
  t.is(result.boolean, true, 'should preserve existing boolean');
  t.deepEqual(result.object, { a: 1, b: 2 }, 'should merge objects');
  t.deepEqual(result.array, [1, 2, 3], 'should set null array');
  // Note: Date objects are treated as regular objects by applyHookDefaults
  // so they get merged recursively rather than assigned directly
  t.true(typeof result.date === 'object', 'should handle date object');
});

test('applyHookDefaults - circular reference limitation', t => {
  const target = { a: 1 };
  const source = { b: 2 };
  source.self = source; // Create circular reference

  // The current implementation does not handle circular references
  // and will cause a stack overflow, so we test that this throws
  t.throws(
    () => {
      applyHookDefaults(target, source);
    },
    { instanceOf: RangeError },
    'should throw on circular reference (known limitation)',
  );
});

// Tests for array concatenation behavior
test('applyHookDefaults - array concatenation: both arrays', t => {
  const target = { hooks: ['target1', 'target2'] };
  const source = { hooks: ['source1', 'source2'] };
  const result = applyHookDefaults(target, source);

  t.deepEqual(
    result.hooks,
    ['source1', 'source2', 'target1', 'target2'],
    'should concatenate arrays with source items first',
  );
});

test('applyHookDefaults - array concatenation: source array, target not array', t => {
  const target = { hooks: 'target' };
  const source = { hooks: ['source1', 'source2'] };
  const result = applyHookDefaults(target, source);

  t.deepEqual(
    result.hooks,
    ['source1', 'source2', 'target'],
    'should create array with source items first, then target',
  );
});

test('applyHookDefaults - array concatenation: target array, source not array', t => {
  const target = { hooks: ['target1', 'target2'] };
  const source = { hooks: 'source' };
  const result = applyHookDefaults(target, source);

  t.deepEqual(
    result.hooks,
    ['source', 'target1', 'target2'],
    'should create array with source first, then target items',
  );
});

test('applyHookDefaults - array concatenation: nested objects', t => {
  const target = {
    config: {
      packageDependencies: ['userHook1', 'userHook2'],
    },
  };
  const source = {
    config: {
      packageDependencies: 'defaultHook',
    },
  };
  const result = applyHookDefaults(target, source);

  t.deepEqual(
    result.config.packageDependencies,
    ['defaultHook', 'userHook1', 'userHook2'],
    'should handle array concatenation in nested objects',
  );
});
