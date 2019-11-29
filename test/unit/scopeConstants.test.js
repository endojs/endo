import test from 'tape';
import { getScopeConstants } from '../../src/scopeConstants';

test('getScopeConstants - global object', t => {
  t.plan(20);

  t.deepEqual(getScopeConstants({}), [], 'should return empty if no global');

  t.deepEqual(
    getScopeConstants({ foo: true }),
    [],
    'should reject configurable & writable',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { foo: { value: true } })),
    ['foo'],
    'should return non configurable & non writable',
  );
  t.deepEqual(
    getScopeConstants(
      Object.create(null, { foo: { value: true, configurable: true } }),
    ),
    [],
    'should reject configurable',
  );
  t.deepEqual(
    getScopeConstants(
      Object.create(null, { foo: { value: true, writable: true } }),
    ),
    [],
    'should reject writable',
  );

  t.deepEqual(
    getScopeConstants(Object.create(null, { foo: { get: () => true } })),
    [],
    'should reject getter',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { foo: { set: () => true } })),
    [],
    'should reject setter',
  );

  t.deepEqual(
    getScopeConstants(Object.create(null, { eval: { value: true } })),
    [],
    'should reject eval',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { const: { value: true } })),
    [],
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
    [],
    'should reject literals (reserved)',
  );
  t.deepEqual(
    getScopeConstants(
      Object.create(null, {
        this: { value: true },
        arguments: { value: true },
      }),
    ),
    [],
    'should reject this and arguments',
  );
  t.deepEqual(
    getScopeConstants(
      Object.create(null, { [Symbol.iterator]: { value: true } }),
    ),
    [],
    'should reject symbols',
  );

  t.deepEqual(
    getScopeConstants(Object.create(null, { 123: { value: true } })),
    [],
    'should reject leading digit',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { '-123': { value: true } })),
    [],
    'should reject leading dash',
  );

  t.deepEqual(
    getScopeConstants(Object.create(null, { _123: { value: true } })),
    ['_123'],
    'should return leading underscore',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { $123: { value: true } })),
    ['$123'],
    'should return leading underscore',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { a123: { value: true } })),
    ['a123'],
    'should return leading lowercase',
  );
  t.deepEqual(
    getScopeConstants(Object.create(null, { A123: { value: true } })),
    ['A123'],
    'should return leading uppercase',
  );

  t.deepEqual(
    getScopeConstants(
      Object.create(null, { foo: { value: true }, bar: { value: true } }),
    ),
    ['foo', 'bar'],
    'should return all non configurable & non writable',
  );
  t.deepEqual(
    getScopeConstants(
      Object.create(null, {
        foo: { value: true },
        bar: { value: true, configurable: true },
      }),
    ),
    ['foo'],
    'should return only non configurable & non writable',
  );
});

test('getScopeConstants - local object (endownments)', t => {
  t.plan(20);

  t.deepEqual(getScopeConstants({}, {}), [], 'should return empty if no local');

  t.deepEqual(
    getScopeConstants({}, { foo: true }),
    [],
    'should reject configurable & writable',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { foo: { value: true } })),
    ['foo'],
    'should return non configurable & non writable',
  );
  t.deepEqual(
    getScopeConstants(
      {},
      Object.create(null, { foo: { value: true, configurable: true } }),
    ),
    [],
    'should reject configurable',
  );
  t.deepEqual(
    getScopeConstants(
      {},
      Object.create(null, { foo: { value: true, writable: true } }),
    ),
    [],
    'should reject writable',
  );

  t.deepEqual(
    getScopeConstants({}, Object.create(null, { foo: { get: () => true } })),
    [],
    'should reject getter',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { foo: { set: () => true } })),
    [],
    'should reject setter',
  );

  t.deepEqual(
    getScopeConstants({}, Object.create(null, { eval: { value: true } })),
    [],
    'should reject eval',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { const: { value: true } })),
    [],
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
    [],
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
    [],
    'should reject this and arguments',
  );
  t.deepEqual(
    getScopeConstants(
      {},
      Object.create(null, { [Symbol.iterator]: { value: true } }),
    ),
    [],
    'should reject symbols',
  );

  t.deepEqual(
    getScopeConstants({}, Object.create(null, { 123: { value: true } })),
    [],
    'should reject leading digit',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { '-123': { value: true } })),
    [],
    'should reject leading dash',
  );

  t.deepEqual(
    getScopeConstants({}, Object.create(null, { _123: { value: true } })),
    ['_123'],
    'should return leading underscore',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { $123: { value: true } })),
    ['$123'],
    'should return leading underscore',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { a123: { value: true } })),
    ['a123'],
    'should return leading lowercase',
  );
  t.deepEqual(
    getScopeConstants({}, Object.create(null, { A123: { value: true } })),
    ['A123'],
    'should return leading uppercase',
  );

  t.deepEqual(
    getScopeConstants(
      {},
      Object.create(null, { foo: { value: true }, bar: { value: true } }),
    ),
    ['foo', 'bar'],
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
    ['foo'],
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
    ['bar'],
    'should only return global contants not hidden by local',
  );
});
