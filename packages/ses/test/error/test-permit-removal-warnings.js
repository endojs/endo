import test from 'ava';
import '../../index.js';
import { assertLogs } from './throws-and-logs.js';
// import { whitelistIntrinsics } from '../../src/permits-intrinsics.js';

const { defineProperties } = Object;
const { apply } = Reflect;

const originalIsArray = Array.isArray;

defineProperties(Array, {
  extraRemovableDataProperty: {
    value: 'extra removable data property',
    configurable: true,
  },
  isArray: {
    value: function isArrayWithCleanablePrototype(...args) {
      return apply(originalIsArray, this, args);
    },
  },
});

// TODO unskip once https://github.com/endojs/endo/issues/1973 is fixed.
test.skip('permit removal warnings', t => {
  assertLogs(
    t,
    () => lockdown(),
    [
      ['groupCollapsed', 'Removing unpermitted intrinsics'],
      ['warn', 'Removing intrinsics.Array.isArray.prototype'],
      [
        'warn',
        'Tolerating undeletable intrinsics.Array.isArray.prototype === undefined',
      ],
      ['warn', 'Removing intrinsics.Array.extraRemovableDataProperty'],
      ['groupEnd'],
    ],
    {},
  );
});
