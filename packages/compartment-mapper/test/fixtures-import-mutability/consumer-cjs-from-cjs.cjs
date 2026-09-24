/* eslint-env node */
// CJS importing CJS (exports.*)
const sourceWhole = require('./source-cjs.cjs');
const { namedA, namedB, default: defaultVal } = require('./source-cjs.cjs');

// CJS importing CJS (module.exports = {...})
const sourceWholeOw = require('./source-cjs-overwrite.cjs');
const {
  namedA: namedAOw,
  namedB: namedBOw,
  default: defaultValOw,
} = require('./source-cjs-overwrite.cjs');

// Capture values at import time
const before = {
  wholeObject_namedA: sourceWhole.namedA,
  wholeObject_namedB: sourceWhole.namedB,
  wholeObject_default: sourceWhole.default,
  destructured_namedA: namedA,
  destructured_namedB: namedB,
  destructured_default: defaultVal,
};
const beforeOw = {
  wholeObject_namedA: sourceWholeOw.namedA,
  wholeObject_namedB: sourceWholeOw.namedB,
  wholeObject_default: sourceWholeOw.default,
  destructured_namedA: namedAOw,
  destructured_namedB: namedBOw,
  destructured_default: defaultValOw,
};

module.exports.getResults = () => {
  return {
    title: 'CJS importing CJS (exports.*)',
    wholeObject_namedA: {
      before: before.wholeObject_namedA,
      after: sourceWhole.namedA,
    },
    wholeObject_namedB: {
      before: before.wholeObject_namedB,
      after: sourceWhole.namedB,
    },
    wholeObject_default: {
      before: before.wholeObject_default,
      after: sourceWhole.default,
    },
    destructured_namedA: { before: before.destructured_namedA, after: namedA },
    destructured_namedB: { before: before.destructured_namedB, after: namedB },
    destructured_default: {
      before: before.destructured_default,
      after: defaultVal,
    },
  };
};

module.exports.getResultsOverwrite = () => {
  return {
    title: 'CJS importing CJS (module.exports = {...})',
    wholeObject_namedA: {
      before: beforeOw.wholeObject_namedA,
      after: sourceWholeOw.namedA,
    },
    wholeObject_namedB: {
      before: beforeOw.wholeObject_namedB,
      after: sourceWholeOw.namedB,
    },
    wholeObject_default: {
      before: beforeOw.wholeObject_default,
      after: sourceWholeOw.default,
    },
    destructured_namedA: {
      before: beforeOw.destructured_namedA,
      after: namedAOw,
    },
    destructured_namedB: {
      before: beforeOw.destructured_namedB,
      after: namedBOw,
    },
    destructured_default: {
      before: beforeOw.destructured_default,
      after: defaultValOw,
    },
  };
};
