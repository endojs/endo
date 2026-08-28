/* eslint-env node */
// CJS importing ESM via require()
// (source-esm has no top-level await, so require works in environments that support it)

const sourceEsm = require('./source-esm.mjs');

// Capture values at import time
const before = {
  namespace_namedLet: sourceEsm.namedLet,
  namespace_namedVar: sourceEsm.namedVar,
  // namespace_namedConstValue: sourceEsm.namedConst.value,
  namespace_default: sourceEsm.default,
};

module.exports.getResults = () => {
  return {
    title: 'CJS importing ESM (require())',
    namespace_namedLet: {
      before: before.namespace_namedLet,
      after: sourceEsm.namedLet,
    },
    namespace_namedVar: {
      before: before.namespace_namedVar,
      after: sourceEsm.namedVar,
    },
    // namespace_namedConstValue: { before: before.namespace_namedConstValue, after: sourceEsm.namedConst.value },
    namespace_default: {
      before: before.namespace_default,
      after: sourceEsm.default,
    },
  };
};
