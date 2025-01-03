// @ts-nocheck
/* global globalThis */
/* eslint-disable @endo/no-nullish-coalescing */

/**
 * @typedef {|
 *   { import: string, as?: string, from: string } |
 *   { importAllFrom: string, as: string, from: string } |
 *   { export: string, as?: string, from?: string } |
 *   { exportAllFrom: string, as?: string } |
 *   {importFrom: string }
 * } Binding
 */

/** @param {Binding[]} bindings */
function* getImports(bindings) {
  for (const binding of bindings) {
    if (binding.import !== undefined) {
      yield binding.from;
    } else if (binding.importFrom !== undefined) {
      yield binding.importFrom;
    } else if (binding.importAllFrom !== undefined) {
      yield binding.importAllFrom;
    } else if (binding.exportAllFrom !== undefined) {
      yield binding.exportAllFrom;
    }
  }
}

/** @param {Binding[]} bindings */
function* getExports(bindings) {
  for (const binding of bindings) {
    if (binding.export !== undefined) {
      yield binding.as ?? binding.export;
    }
  }
}

/** @param {Binding[]} bindings */
function* getReexports(bindings) {
  for (const binding of bindings) {
    if (binding.exportAllFrom !== undefined) {
      yield binding.exportAllFrom;
    }
  }
}

const ModuleSource = globalThis.ModuleSource;

Object.defineProperties(
  ModuleSource.prototype,
  Object.getOwnPropertyDescriptors({
    get imports() {
      return Array.from(new Set(getImports(this.bindings)));
    },

    get exports() {
      return Array.from(new Set(getExports(this.bindings)));
    },

    get reexports() {
      return Array.from(new Set(getReexports(this.bindings)));
    },
  }),
);

export { ModuleSource };
