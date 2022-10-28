import test from 'ava';
import { getScopeConstants } from '../src/scope-constants.js';

test('getScopeConstants - global object', t => {
  t.plan(20);

  t.deepEqual(
    getScopeConstants({}),
    { moduleLexicalConstants: [], globalObjectConstants: [] },
    'should return empty if no global',
  );

  t.deepEqual(
    getScopeConstants({ foo: true }),
    { globalObjectConstants: [], moduleLexicalConstants: [] },
    'should reject configurable & writable',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { foo: { value: true } })),
    { globalObjectConstants: ['foo'], moduleLexicalConstants: [] },
    'should return non configurable & non writable',
  );
  t.deepEqual(
    getScopeConstants(
      Object.create(null, { foo: { value: true, configurable: true } }),
    ),
    { globalObjectConstants: [], moduleLexicalConstants: [] },
    'should reject configurable',
  );
  t.deepEqual(
    getScopeConstants(
      Object.create(null, { foo: { value: true, writable: true } }),
    ),
    { globalObjectConstants: [], moduleLexicalConstants: [] },
    'should reject writable',
  );

  t.deepEqual(
    getScopeConstants(Object.create(null, { foo: { get: () => true } })),
    { globalObjectConstants: [], moduleLexicalConstants: [] },
    'should reject getter',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { foo: { set: () => true } })),
    { globalObjectConstants: [], moduleLexicalConstants: [] },
    'should reject setter',
  );

  t.deepEqual(
    getScopeConstants(Object.create(null, { eval: { value: true } })),
    { globalObjectConstants: [], moduleLexicalConstants: [] },
    'should reject eval',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { const: { value: true } })),
    { globalObjectConstants: [], moduleLexicalConstants: [] },
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
    { globalObjectConstants: [], moduleLexicalConstants: [] },
    'should reject literals (reserved)',
  );
  t.deepEqual(
    getScopeConstants(
      Object.create(null, {
        this: { value: true },
        arguments: { value: true },
      }),
    ),
    { globalObjectConstants: [], moduleLexicalConstants: [] },
    'should reject this and arguments',
  );
  t.deepEqual(
    getScopeConstants(
      Object.create(null, { [Symbol.iterator]: { value: true } }),
    ),
    { globalObjectConstants: [], moduleLexicalConstants: [] },
    'should reject symbols',
  );

  t.deepEqual(
    getScopeConstants(Object.create(null, { 123: { value: true } })),
    { globalObjectConstants: [], moduleLexicalConstants: [] },
    'should reject leading digit',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { '-123': { value: true } })),
    { globalObjectConstants: [], moduleLexicalConstants: [] },
    'should reject leading dash',
  );

  t.deepEqual(
    getScopeConstants(Object.create(null, { _123: { value: true } })),
    { globalObjectConstants: ['_123'], moduleLexicalConstants: [] },
    'should return leading underscore',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { $123: { value: true } })),
    { globalObjectConstants: ['$123'], moduleLexicalConstants: [] },
    'should return leading underscore',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { a123: { value: true } })),
    { globalObjectConstants: ['a123'], moduleLexicalConstants: [] },
    'should return leading lowercase',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { A123: { value: true } })),
    { globalObjectConstants: ['A123'], moduleLexicalConstants: [] },
    'should return leading uppercase',
  );

  t.deepEqual(
    getScopeConstants(
      Object.create(null, { foo: { value: true }, bar: { value: true } }),
    ),
    { globalObjectConstants: ['foo', 'bar'], moduleLexicalConstants: [] },
    'should return all non configurable & non writable',
  );
  t.deepEqual(
    getScopeConstants(
      Object.create(null, {
        foo: { value: true },
        bar: { value: true, configurable: true },
      }),
    ),
    { globalObjectConstants: ['foo'], moduleLexicalConstants: [] },
    'should return only non configurable & non writable',
  );
});

test('getScopeConstants - module lexicals', t => {
  t.plan(20);

  t.deepEqual(
    getScopeConstants({}, {}),
    { globalObjectConstants: [], moduleLexicalConstants: [] },
    'should return empty if no module lexicals',
  );

  t.deepEqual(
    getScopeConstants({}, { foo: true }),
    { globalObjectConstants: [], moduleLexicalConstants: [] },
    'should reject configurable & writable',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { foo: { value: true } })),
    { globalObjectConstants: [], moduleLexicalConstants: ['foo'] },
    'should return non configurable & non writable',
  );
  t.deepEqual(
    getScopeConstants(
      {},
      Object.create(null, { foo: { value: true, configurable: true } }),
    ),
    { globalObjectConstants: [], moduleLexicalConstants: [] },
    'should reject configurable',
  );
  t.deepEqual(
    getScopeConstants(
      {},
      Object.create(null, { foo: { value: true, writable: true } }),
    ),
    { globalObjectConstants: [], moduleLexicalConstants: [] },
    'should reject writable',
  );

  t.deepEqual(
    getScopeConstants({}, Object.create(null, { foo: { get: () => true } })),
    { globalObjectConstants: [], moduleLexicalConstants: [] },
    'should reject getter',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { foo: { set: () => true } })),
    { globalObjectConstants: [], moduleLexicalConstants: [] },
    'should reject setter',
  );

  t.deepEqual(
    getScopeConstants({}, Object.create(null, { eval: { value: true } })),
    { globalObjectConstants: [], moduleLexicalConstants: [] },
    'should reject eval',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { const: { value: true } })),
    { globalObjectConstants: [], moduleLexicalConstants: [] },
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
    { globalObjectConstants: [], moduleLexicalConstants: [] },
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
    { globalObjectConstants: [], moduleLexicalConstants: [] },
    'should reject this and arguments',
  );
  t.deepEqual(
    getScopeConstants(
      {},
      Object.create(null, { [Symbol.iterator]: { value: true } }),
    ),
    { globalObjectConstants: [], moduleLexicalConstants: [] },
    'should reject symbols',
  );

  t.deepEqual(
    getScopeConstants({}, Object.create(null, { 123: { value: true } })),
    { globalObjectConstants: [], moduleLexicalConstants: [] },
    'should reject leading digit',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { '-123': { value: true } })),
    { globalObjectConstants: [], moduleLexicalConstants: [] },
    'should reject leading dash',
  );

  t.deepEqual(
    getScopeConstants({}, Object.create(null, { _123: { value: true } })),
    { globalObjectConstants: [], moduleLexicalConstants: ['_123'] },
    'should return leading underscore',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { $123: { value: true } })),
    { globalObjectConstants: [], moduleLexicalConstants: ['$123'] },
    'should return leading underscore',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { a123: { value: true } })),
    { globalObjectConstants: [], moduleLexicalConstants: ['a123'] },
    'should return leading lowercase',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { A123: { value: true } })),
    { globalObjectConstants: [], moduleLexicalConstants: ['A123'] },
    'should return leading uppercase',
  );

  t.deepEqual(
    getScopeConstants(
      {},
      Object.create(null, { foo: { value: true }, bar: { value: true } }),
    ),
    { globalObjectConstants: [], moduleLexicalConstants: ['foo', 'bar'] },
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
    { globalObjectConstants: [], moduleLexicalConstants: ['foo'] },
    'should return only non configurable & non writable',
  );
});

test('getScopeConstants - global object and module lexicals', t => {
  t.plan(1);

  t.deepEqual(
    getScopeConstants(
      Object.create(null, { foo: { value: true }, bar: { value: true } }),
      { foo: false },
    ),
    { globalObjectConstants: ['bar'], moduleLexicalConstants: [] },
    'should only return global contants not hidden by module lexicals',
  );
});
