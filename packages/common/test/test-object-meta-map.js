import { test } from '@endo/ses-ava/prepare-test-env-ava.js';
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
            value: desc.value * 2,
            enumerable: false,
          },
    null,
  );
  t.deepEqual(getOwnPropertyDescriptors(mapped), {
    a: {
      value: 2,
      writable: false,
      enumerable: false,
      configurable: false,
    },
    c: {
      value: 6,
      writable: false,
      enumerable: false,
      configurable: false,
    },
  });
  t.is(getPrototypeOf(mapped), null);
});
