// ESM importing ESM
import defaultExport, {
  namedLet,
  namedVar,
  namedConst,
} from './source-esm.mjs';
import * as namespace from './source-esm.mjs';

// Capture values at import time
const before = {
  defaultExport,
  namedLet,
  namedVar,
  namedConstValue: namedConst.value,
  namespaceDefault: namespace.default,
  namespaceNamedLet: namespace.namedLet,
  namespaceNamedVar: namespace.namedVar,
  namespaceNamedConstValue: namespace.namedConst.value,
};

export function getResults() {
  return {
    title: 'ESM importing ESM',
    defaultExport: { before: before.defaultExport, after: defaultExport },
    namedLet: { before: before.namedLet, after: namedLet },
    namedVar: { before: before.namedVar, after: namedVar },
    namedConstValue: {
      before: before.namedConstValue,
      after: namedConst.value,
    },
    namespaceDefault: {
      before: before.namespaceDefault,
      after: namespace.default,
    },
    namespaceNamedLet: {
      before: before.namespaceNamedLet,
      after: namespace.namedLet,
    },
    namespaceNamedVar: {
      before: before.namespaceNamedVar,
      after: namespace.namedVar,
    },
    namespaceNamedConstValue: {
      before: before.namespaceNamedConstValue,
      after: namespace.namedConst.value,
    },
  };
}
