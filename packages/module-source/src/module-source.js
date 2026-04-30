/* eslint no-underscore-dangle: ["off"] */

import { makeModuleAnalyzer } from './transform-analyze.js';

/**
 * @import {ModuleSourceOptions} from './types/module-source.js'
 */

// Disable readonly markings.
const freeze = /** @type {<T>(v: T) => T} */ (Object.freeze);

// If all ESM implementations were correct, it would be sufficient to
// `import babel` instead of `import * as babel`.
// However, the `node -r esm` emulation of ESM produces a linker error,
// claiming there is no export named default.
// Also, the behavior of `import * as babel` changes from Node.js 14 to 16.
// Node.js 14 produces an extraneous { default } wrapper around the exports
// namespace and 16 introduces lexical static analysis of exported names, so
// comes closer to correct, and at least consistent with `node -r esm`.
//
// Node.js 14:
//   NESM:
//     babel:     exports
//     babelStar: { default: exports }
//   RESM:
//     babel:     linker error: no export named default
//     babelStar: exports
// Node.js 16:
//   NESM:
//     babel:     exports
//     babelStar: exports + trash
//   RESM:
//     babel:     linker error: no export named default
//     babelStar: exports

const analyzeModule = makeModuleAnalyzer();

// XXX implements import('ses').PrecompiledModuleSource but adding
// `@implements` errors that this isn't a class and `@returns` errors that
// there's no value returned.
/**
 * ModuleSource captures the effort of parsing and analyzing module text
 * so a cache of ModuleSources may be shared by multiple Compartments.
 *
 * @class
 * @param {string} source
 * @param {string | ModuleSourceOptions} [opts]
 */
export function ModuleSource(source, opts = {}) {
  if (new.target === undefined) {
    throw TypeError(
      "Class constructor ModuleSource cannot be invoked without 'new'",
    );
  }
  if (typeof opts === 'string') {
    opts = { sourceUrl: opts };
  }
  // analyzeModule now returns a frozen PrecompiledModuleSource-shaped record
  // via buildModuleRecord(), so we copy its properties directly.
  const record = analyzeModule(source, opts);
  this.imports = record.imports;
  this.exports = record.exports;
  this.reexports = record.reexports;
  this.__syncModuleProgram__ = record.__syncModuleProgram__;
  this.__liveExportMap__ = record.__liveExportMap__;
  this.__reexportMap__ = record.__reexportMap__;
  this.__fixedExportMap__ = record.__fixedExportMap__;
  this.__needsImport__ = record.__needsImport__;
  this.__needsImportMeta__ = record.__needsImportMeta__;
  freeze(this);
}

// AbstractModuleSource
// https://github.com/tc39/proposal-source-phase-imports?tab=readme-ov-file#js-module-source
//
// We are attempting to ensure that a JavaScript shim (particularly ses) is
// forward-compatible as the engine evolves beneath it, with or without this
// ModuleSource shim, and with our without a native AbstractModuleSource which
// remains undecided.
// Lockdown does not gracefully handle the presence of an unexpected prototype,
// but can tolerate the absence of an expected prototype.
// So, we are providing AbstractModuleSource since we can better tolerate the
// various uncertain futures.
//
// WebAssembly and ModuleSource are both in motion.
// The Source Phase Imports proposal implies an additional AbstractModuleSource
// layer above the existing WebAssembly.Module that would be shared by
// the JavaScript ModuleSource prototype chains.
// At time of writing, no version of WebAssembly provides the shared base
// class, and the ModuleSource *shim* gains nothing from sharing one when that
// prototype when it comes into being.
// So, we do not attempt to entangle our AbstractModuleSource with
// WebAssembly.Module.

function AbstractModuleSource() {
  // no-op, safe to super()
}

Object.setPrototypeOf(ModuleSource, AbstractModuleSource);
Object.setPrototypeOf(ModuleSource.prototype, AbstractModuleSource.prototype);

freeze(AbstractModuleSource);
freeze(AbstractModuleSource.prototype);
freeze(ModuleSource.prototype);
freeze(ModuleSource);
