import test from '@endo/ses-ava/test.js';

import { objectMetaMap } from '../object-meta-map.js';

const { getOwnPropertyDescriptors, getPrototypeOf } = Object;

// @ts-expect-error isFake is not advertised by the type of harden.
const hardenIsFake = !!harden.isFake;

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
  t.deepEqual(getOwnPropertyDescriptors(mapped), {
    a: {
      value: 2,
      writable: hardenIsFake,
      enumerable: false,
      configurable: hardenIsFake,
    },
    c: {
      value: 6,
      writable: hardenIsFake,
      enumerable: false,
      configurable: hardenIsFake,
    },
  });
  t.is(getPrototypeOf(mapped), null);
});
