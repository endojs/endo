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
