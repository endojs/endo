import test from 'ava';
import { getScopeConstants } from '../src/scope-constants.js';

test('getScopeConstants - global object', t => {
  t.plan(20);

  t.deepEqual(
    getScopeConstants({}),
    { globalLexicalConstants: [], globalObjectConstants: [] },
    'should return empty if no global',
  );

  t.deepEqual(
    getScopeConstants({ foo: true }),
    { globalObjectConstants: [], globalLexicalConstants: [] },
    'should reject configurable & writable',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { foo: { value: true } })),
    { globalObjectConstants: ['foo'], globalLexicalConstants: [] },
    'should return non configurable & non writable',
  );
  t.deepEqual(
    getScopeConstants(
      Object.create(null, { foo: { value: true, configurable: true } }),
    ),
    { globalObjectConstants: [], globalLexicalConstants: [] },
    'should reject configurable',
  );
  t.deepEqual(
    getScopeConstants(
      Object.create(null, { foo: { value: true, writable: true } }),
    ),
    { globalObjectConstants: [], globalLexicalConstants: [] },
    'should reject writable',
  );

  t.deepEqual(
    getScopeConstants(Object.create(null, { foo: { get: () => true } })),
    { globalObjectConstants: [], globalLexicalConstants: [] },
    'should reject getter',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { foo: { set: () => true } })),
    { globalObjectConstants: [], globalLexicalConstants: [] },
    'should reject setter',
  );

  t.deepEqual(
    getScopeConstants(Object.create(null, { eval: { value: true } })),
    { globalObjectConstants: [], globalLexicalConstants: [] },
    'should reject eval',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { const: { value: true } })),
    { globalObjectConstants: [], globalLexicalConstants: [] },
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
    { globalObjectConstants: [], globalLexicalConstants: [] },
    'should reject literals (reserved)',
  );
  t.deepEqual(
    getScopeConstants(
      Object.create(null, {
        this: { value: true },
        arguments: { value: true },
      }),
    ),
    { globalObjectConstants: [], globalLexicalConstants: [] },
    'should reject this and arguments',
  );
  t.deepEqual(
    getScopeConstants(
      Object.create(null, { [Symbol.iterator]: { value: true } }),
    ),
    { globalObjectConstants: [], globalLexicalConstants: [] },
    'should reject symbols',
  );

  t.deepEqual(
    getScopeConstants(Object.create(null, { 123: { value: true } })),
    { globalObjectConstants: [], globalLexicalConstants: [] },
    'should reject leading digit',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { '-123': { value: true } })),
    { globalObjectConstants: [], globalLexicalConstants: [] },
    'should reject leading dash',
  );

  t.deepEqual(
    getScopeConstants(Object.create(null, { _123: { value: true } })),
    { globalObjectConstants: ['_123'], globalLexicalConstants: [] },
    'should return leading underscore',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { $123: { value: true } })),
    { globalObjectConstants: ['$123'], globalLexicalConstants: [] },
    'should return leading underscore',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { a123: { value: true } })),
    { globalObjectConstants: ['a123'], globalLexicalConstants: [] },
    'should return leading lowercase',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { A123: { value: true } })),
    { globalObjectConstants: ['A123'], globalLexicalConstants: [] },
    'should return leading uppercase',
  );

  t.deepEqual(
    getScopeConstants(
      Object.create(null, { foo: { value: true }, bar: { value: true } }),
    ),
    { globalObjectConstants: ['foo', 'bar'], globalLexicalConstants: [] },
    'should return all non configurable & non writable',
  );
  t.deepEqual(
    getScopeConstants(
      Object.create(null, {
        foo: { value: true },
        bar: { value: true, configurable: true },
      }),
    ),
    { globalObjectConstants: ['foo'], globalLexicalConstants: [] },
    'should return only non configurable & non writable',
  );
});

test('getScopeConstants - local object (endownments)', t => {
  t.plan(20);

  t.deepEqual(
    getScopeConstants({}, {}),
    { globalObjectConstants: [], globalLexicalConstants: [] },
    'should return empty if no local',
  );

  t.deepEqual(
    getScopeConstants({}, { foo: true }),
    { globalObjectConstants: [], globalLexicalConstants: [] },
    'should reject configurable & writable',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { foo: { value: true } })),
    { globalObjectConstants: [], globalLexicalConstants: ['foo'] },
    'should return non configurable & non writable',
  );
  t.deepEqual(
    getScopeConstants(
      {},
      Object.create(null, { foo: { value: true, configurable: true } }),
    ),
    { globalObjectConstants: [], globalLexicalConstants: [] },
    'should reject configurable',
  );
  t.deepEqual(
    getScopeConstants(
      {},
      Object.create(null, { foo: { value: true, writable: true } }),
    ),
    { globalObjectConstants: [], globalLexicalConstants: [] },
    'should reject writable',
  );

  t.deepEqual(
    getScopeConstants({}, Object.create(null, { foo: { get: () => true } })),
    { globalObjectConstants: [], globalLexicalConstants: [] },
    'should reject getter',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { foo: { set: () => true } })),
    { globalObjectConstants: [], globalLexicalConstants: [] },
    'should reject setter',
  );

  t.deepEqual(
    getScopeConstants({}, Object.create(null, { eval: { value: true } })),
    { globalObjectConstants: [], globalLexicalConstants: [] },
    'should reject eval',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { const: { value: true } })),
    { globalObjectConstants: [], globalLexicalConstants: [] },
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
    { globalObjectConstants: [], globalLexicalConstants: [] },
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
    { globalObjectConstants: [], globalLexicalConstants: [] },
    'should reject this and arguments',
  );
  t.deepEqual(
    getScopeConstants(
      {},
      Object.create(null, { [Symbol.iterator]: { value: true } }),
    ),
    { globalObjectConstants: [], globalLexicalConstants: [] },
    'should reject symbols',
  );

  t.deepEqual(
    getScopeConstants({}, Object.create(null, { 123: { value: true } })),
    { globalObjectConstants: [], globalLexicalConstants: [] },
    'should reject leading digit',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { '-123': { value: true } })),
    { globalObjectConstants: [], globalLexicalConstants: [] },
    'should reject leading dash',
  );

  t.deepEqual(
    getScopeConstants({}, Object.create(null, { _123: { value: true } })),
    { globalObjectConstants: [], globalLexicalConstants: ['_123'] },
    'should return leading underscore',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { $123: { value: true } })),
    { globalObjectConstants: [], globalLexicalConstants: ['$123'] },
    'should return leading underscore',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { a123: { value: true } })),
    { globalObjectConstants: [], globalLexicalConstants: ['a123'] },
    'should return leading lowercase',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { A123: { value: true } })),
    { globalObjectConstants: [], globalLexicalConstants: ['A123'] },
    'should return leading uppercase',
  );

  t.deepEqual(
    getScopeConstants(
      {},
      Object.create(null, { foo: { value: true }, bar: { value: true } }),
    ),
    { globalObjectConstants: [], globalLexicalConstants: ['foo', 'bar'] },
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
    { globalObjectConstants: [], globalLexicalConstants: ['foo'] },
    'should return only non configurable & non writable',
  );
});

test('getScopeConstants - global and local object', t => {
  t.plan(1);

  t.deepEqual(
    getScopeConstants(
      Object.create(null, { foo: { value: true }, bar: { value: true } }),
      { foo: false },
    ),
    { globalObjectConstants: ['bar'], globalLexicalConstants: [] },
    'should only return global contants not hidden by local',
  );
});
