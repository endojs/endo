// ESM importing CJS
import defaultExport, { namedA } from './source-cjs.cjs';
import * as namespace from './source-cjs.cjs';
import defaultExportOw, {
  namedA as namedAOw,
} from './source-cjs-overwrite.cjs';
import * as namespaceOw from './source-cjs-overwrite.cjs';

// Capture values at import time
const before = {
  namedExport_namedA: namedA,
  defaultExport_namedA: defaultExport.namedA,
  defaultExport_namedB: defaultExport.namedB,
  defaultExport_default: defaultExport.default,
  namespace_default_namedA: namespace.default.namedA,
  namespace_default_namedB: namespace.default.namedB,
};
const beforeOw = {
  namedExport_namedA: namedAOw,
  defaultExport_namedA: defaultExportOw.namedA,
  defaultExport_namedB: defaultExportOw.namedB,
  defaultExport_default: defaultExportOw.default,
  namespace_default_namedA: namespaceOw.default.namedA,
  namespace_default_namedB: namespaceOw.default.namedB,
};

export function getResults() {
  return {
    title: 'ESM importing CJS (exports.*)',
    namedExport_namedA: { before: before.namedExport_namedA, after: namedA },
    defaultExport_namedA: {
      before: before.defaultExport_namedA,
      after: defaultExport.namedA,
    },
    defaultExport_namedB: {
      before: before.defaultExport_namedB,
      after: defaultExport.namedB,
    },
    defaultExport_default: {
      before: before.defaultExport_default,
      after: defaultExport.default,
    },
    namespace_default_namedA: {
      before: before.namespace_default_namedA,
      after: namespace.default.namedA,
    },
    namespace_default_namedB: {
      before: before.namespace_default_namedB,
      after: namespace.default.namedB,
    },
  };
}

export function getResultsOverwrite() {
  return {
    title: 'ESM importing CJS (module.exports = {...})',
    namedExport_namedA: {
      before: beforeOw.namedExport_namedA,
      after: namedAOw,
    },
    defaultExport_namedA: {
      before: beforeOw.defaultExport_namedA,
      after: defaultExportOw.namedA,
    },
    defaultExport_namedB: {
      before: beforeOw.defaultExport_namedB,
      after: defaultExportOw.namedB,
    },
    defaultExport_default: {
      before: beforeOw.defaultExport_default,
      after: defaultExportOw.default,
    },
    namespace_default_namedA: {
      before: beforeOw.namespace_default_namedA,
      after: namespaceOw.default.namedA,
    },
    namespace_default_namedB: {
      before: beforeOw.namespace_default_namedB,
      after: namespaceOw.default.namedB,
    },
  };
}
