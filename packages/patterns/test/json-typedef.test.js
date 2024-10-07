import test from '@endo/ses-ava/prepare-endo.js';

import { M } from '../index.js';
import { convertJTDToPattern } from '../src/jtd-to-pattern.js';

test('json-typedef', async t => {
  const schema = {
    properties: {
      foo: {
        type: 'string',
      },
    },
    optionalProperties: {
      bar: {
        type: 'string',
      },
    },
  };
  const pattern = convertJTDToPattern(schema);
  t.deepEqual(
    pattern,
    M.splitRecord(
      {
        foo: M.string(),
      },
      {
        bar: M.string(),
      },
    ),
  );
});

test('convertJTDToPattern - basic types', t => {
  t.deepEqual(convertJTDToPattern({ type: 'boolean' }), M.boolean());
  t.deepEqual(convertJTDToPattern({ type: 'string' }), M.string());
  t.deepEqual(convertJTDToPattern({ type: 'float32' }), M.number());
  t.deepEqual(convertJTDToPattern({ type: 'int32' }), M.number());
});

test('convertJTDToPattern - enum', t => {
  t.deepEqual(
    convertJTDToPattern({ enum: ['red', 'green', 'blue'] }),
    M.or(['red', 'green', 'blue']),
  );
});

test('convertJTDToPattern - properties', t => {
  const jtdSchema = {
    properties: {
      name: { type: 'string' },
      age: { type: 'uint8' },
    },
  };
  const expected = {
    name: M.string(),
    age: M.number(),
  };
  t.deepEqual(convertJTDToPattern(jtdSchema), expected);
});

test('convertJTDToPattern - optional properties', t => {
  const jtdSchema = {
    optionalProperties: {
      nickname: { type: 'string' },
      height: { type: 'float32' },
    },
  };
  const expected = M.splitRecord(
    {},
    {
      nickname: M.string(),
      height: M.number(),
    },
  );
  t.deepEqual(convertJTDToPattern(jtdSchema), expected);
});

test('convertJTDToPattern - array', t => {
  const jtdSchema = {
    elements: { type: 'string' },
  };
  const expected = M.arrayOf(M.string());
  t.deepEqual(convertJTDToPattern(jtdSchema), expected);
});

test('convertJTDToPattern - values (map)', t => {
  const jtdSchema = {
    values: { type: 'boolean' },
  };
  const expected = M.recordOf(M.boolean());
  t.deepEqual(convertJTDToPattern(jtdSchema), expected);
});

test('convertJTDToPattern - nested structures', t => {
  const jtdSchema = {
    properties: {
      name: { type: 'string' },
      tags: {
        elements: { type: 'string' },
      },
      metadata: {
        values: { type: 'string' },
      },
    },
  };
  const expected = {
    name: M.string(),
    tags: M.array(M.string()),
    metadata: M.recordOf(M.string()),
  };
  t.deepEqual(convertJTDToPattern(jtdSchema), expected);
});
