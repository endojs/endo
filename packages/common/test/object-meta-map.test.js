import test from '@endo/ses-ava/test.js';

import harden from '@endo/harden';
import { objectMetaMap } from '../object-meta-map.js';

const { getOwnPropertyDescriptors, getPrototypeOf } = Object;

test('test objectMetaMap', async t => {
  const mapped = objectMetaMap(
    { a: 1, b: 2, c: 3 },
    (desc, key) =>
      key === 'b'
        ? undefined
        : {
            ...desc,
            // @ts-expect-error desc.value possibly undefined
            value: desc.value * 2,
            enumerable: false,
          },
    null,
  );
  const expectedWritable = !!harden.isFake;
  const expectedConfigurable = !!harden.isFake;

  t.deepEqual(getOwnPropertyDescriptors(mapped), {
    a: {
      value: 2,
      writable: expectedWritable,
      enumerable: false,
      configurable: expectedConfigurable,
    },
    c: {
      value: 6,
      writable: expectedWritable,
      enumerable: false,
      configurable: expectedConfigurable,
    },
  });
  t.is(getPrototypeOf(mapped), null);
});
