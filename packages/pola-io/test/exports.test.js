// eslint-disable-next-line import/no-extraneous-dependencies
import * as index from '@endo/pola-io';

import test from 'ava';

const { isFrozen } = Object;

test('index', t => {
  t.snapshot(Object.keys(index).sort());
});

test('all exports are frozen', t => {
  const exports = Object.values(index);
  for (const exportedValue of exports) {
    t.true(
      isFrozen(exportedValue),
      `Export should be frozen: ${exportedValue.name || exportedValue}`,
    );
  }
});
