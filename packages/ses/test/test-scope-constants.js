import test from 'ava';
import { getScopeConstants } from '../src/scope-constants.js';

test('getScopeConstants - globalObject', t => {
  t.plan(20);

  t.deepEqual(
    getScopeConstants({}),
    {
      moduleLexicalConstants: [],
      globalLexicalConstants: [],
      globalObjectConstants: [],
    },
    'should return empty if no global',
  );

  t.deepEqual(
    getScopeConstants({ foo: true }),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: [],
    },
    'should reject configurable & writable',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { foo: { value: true } })),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: ['foo'],
      globalLexicalConstants: [],
    },
    'should return non configurable & non writable',
  );
  t.deepEqual(
    getScopeConstants(
      Object.create(null, { foo: { value: true, configurable: true } }),
    ),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: [],
    },
    'should reject configurable',
  );
  t.deepEqual(
    getScopeConstants(
      Object.create(null, { foo: { value: true, writable: true } }),
    ),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: [],
    },
    'should reject writable',
  );

  t.deepEqual(
    getScopeConstants(Object.create(null, { foo: { get: () => true } })),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: [],
    },
    'should reject getter',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { foo: { set: () => true } })),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: [],
    },
    'should reject setter',
  );

  t.deepEqual(
    getScopeConstants(Object.create(null, { eval: { value: true } })),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: [],
    },
    'should reject eval',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { const: { value: true } })),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: [],
    },
    'should reject reserved keyword',
  );
  t.deepEqual(
    getScopeConstants(
      Object.create(null, {
        null: { value: true },
        true: { value: true },
        false: { value: true },
      }),
    ),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: [],
    },
    'should reject literals (reserved)',
  );
  t.deepEqual(
    getScopeConstants(
      Object.create(null, {
        this: { value: true },
        arguments: { value: true },
      }),
    ),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: [],
    },
    'should reject this and arguments',
  );
  t.deepEqual(
    getScopeConstants(
      Object.create(null, { [Symbol.iterator]: { value: true } }),
    ),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: [],
    },
    'should reject symbols',
  );

  t.deepEqual(
    getScopeConstants(Object.create(null, { 123: { value: true } })),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: [],
    },
    'should reject leading digit',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { '-123': { value: true } })),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: [],
    },
    'should reject leading dash',
  );

  t.deepEqual(
    getScopeConstants(Object.create(null, { _123: { value: true } })),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: ['_123'],
      globalLexicalConstants: [],
    },
    'should return leading underscore',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { $123: { value: true } })),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: ['$123'],
      globalLexicalConstants: [],
    },
    'should return leading underscore',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { a123: { value: true } })),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: ['a123'],
      globalLexicalConstants: [],
    },
    'should return leading lowercase',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { A123: { value: true } })),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: ['A123'],
      globalLexicalConstants: [],
    },
    'should return leading uppercase',
  );

  t.deepEqual(
    getScopeConstants(
      Object.create(null, { foo: { value: true }, bar: { value: true } }),
    ),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: ['foo', 'bar'],
      globalLexicalConstants: [],
    },
    'should return all non configurable & non writable',
  );
  t.deepEqual(
    getScopeConstants(
      Object.create(null, {
        foo: { value: true },
        bar: { value: true, configurable: true },
      }),
    ),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: ['foo'],
      globalLexicalConstants: [],
    },
    'should return only non configurable & non writable',
  );
});

test('getScopeConstants - globalLexicals', t => {
  t.plan(20);

  t.deepEqual(
    getScopeConstants({}, {}),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: [],
    },
    'should return empty if no globalLexicals',
  );

  t.deepEqual(
    getScopeConstants({}, { foo: true }),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: [],
    },
    'should reject configurable & writable',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { foo: { value: true } })),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: ['foo'],
    },
    'should return non configurable & non writable',
  );
  t.deepEqual(
    getScopeConstants(
      {},
      Object.create(null, { foo: { value: true, configurable: true } }),
    ),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: [],
    },
    'should reject configurable',
  );
  t.deepEqual(
    getScopeConstants(
      {},
      Object.create(null, { foo: { value: true, writable: true } }),
    ),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: [],
    },
    'should reject writable',
  );

  t.deepEqual(
    getScopeConstants({}, Object.create(null, { foo: { get: () => true } })),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: [],
    },
    'should reject getter',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { foo: { set: () => true } })),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: [],
    },
    'should reject setter',
  );

  t.deepEqual(
    getScopeConstants({}, Object.create(null, { eval: { value: true } })),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: [],
    },
    'should reject eval',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { const: { value: true } })),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: [],
    },
    'should reject reserved keyword',
  );
  t.deepEqual(
    getScopeConstants(
      {},
      Object.create(null, {
        null: { value: true },
        true: { value: true },
        false: { value: true },
      }),
    ),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: [],
    },
    'should reject literals (reserved)',
  );
  t.deepEqual(
    getScopeConstants(
      {},
      Object.create(null, {
        this: { value: true },
        arguments: { value: true },
      }),
    ),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: [],
    },
    'should reject this and arguments',
  );
  t.deepEqual(
    getScopeConstants(
      {},
      Object.create(null, { [Symbol.iterator]: { value: true } }),
    ),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: [],
    },
    'should reject symbols',
  );

  t.deepEqual(
    getScopeConstants({}, Object.create(null, { 123: { value: true } })),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: [],
    },
    'should reject leading digit',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { '-123': { value: true } })),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: [],
    },
    'should reject leading dash',
  );

  t.deepEqual(
    getScopeConstants({}, Object.create(null, { _123: { value: true } })),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: ['_123'],
    },
    'should return leading underscore',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { $123: { value: true } })),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: ['$123'],
    },
    'should return leading underscore',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { a123: { value: true } })),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: ['a123'],
    },
    'should return leading lowercase',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { A123: { value: true } })),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: ['A123'],
    },
    'should return leading uppercase',
  );

  t.deepEqual(
    getScopeConstants(
      {},
      Object.create(null, { foo: { value: true }, bar: { value: true } }),
    ),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: ['foo', 'bar'],
    },
    'should return all non configurable & non writable',
  );
  t.deepEqual(
    getScopeConstants(
      {},
      Object.create(null, {
        foo: { value: true },
        bar: { value: true, configurable: true },
      }),
    ),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: [],
      globalLexicalConstants: ['foo'],
    },
    'should return only non configurable & non writable',
  );
});

test('getScopeConstants - globalObject and globalLexicals', t => {
  t.plan(1);

  t.deepEqual(
    getScopeConstants(
      Object.create(null, { foo: { value: true }, bar: { value: true } }),
      { foo: false },
    ),
    {
      moduleLexicalConstants: [],
      globalObjectConstants: ['bar'],
      globalLexicalConstants: [],
    },
    'should only return global contants not hidden by global lexicals',
  );
});
