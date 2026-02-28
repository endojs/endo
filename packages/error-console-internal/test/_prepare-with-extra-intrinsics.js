import '../../index.js';

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
  // To ensure that the test below remains tolerant of future engines
  // adding unexpected properties, causing extra warnings on removal.
  // See https://github.com/endojs/endo/issues/1973
  anotherOne: {
    value: `another removable property`,
    configurable: true,
  },
});
