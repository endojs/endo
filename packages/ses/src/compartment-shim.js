// This module exports both Compartment and ModuleStaticRecord because they
// communicate through the moduleAnalyses private side-table.
/* eslint max-classes-per-file: ["error", 2] */

import * as babel from '@agoric/babel-standalone';
// We are using the above import form, and referring to its default export
// explicitly below like babel.default, because the proper construct causes a
// Rollup error.
// This form:
//   import babel from '@agoric/babel-standalone';
// And this variant:
//   import { default as babel } from '@agoric/babel-standalone';
// Both produce:
//   Error: 'default' is not exported by .../@agoric/babel-standalone/babel.js
import { makeModuleAnalyzer } from '@agoric/transform-module';
import { assign } from './commons.js';
import { createGlobalObject } from './global-object.js';
import { performEval } from './evaluate.js';
import { getCurrentRealmRec } from './realm-rec.js';

const analyzeModule = makeModuleAnalyzer(babel.default);

// moduleAnalyses are the private data of a ModuleStaticRecord.
// We use moduleAnalyses in the loader/linker to look up
// the analysis corresponding to any ModuleStaticRecord constructed by an
// importHook.
const moduleAnalyses = new WeakMap();

/**
 * ModuleStaticRecord captures the effort of parsing and analyzing module text
 * so a cache of ModuleStaticRecords may be shared by multiple Compartments.
 */
export class ModuleStaticRecord {
  constructor(text) {
    const analysis = analyzeModule({ string: text });

    this.imports = Object.keys(analysis.imports).sort();

    Object.freeze(this);
    Object.freeze(this.imports);

    moduleAnalyses.set(this, analysis);
  }

  // eslint-disable-next-line class-methods-use-this
  toString() {
    return '[object ModuleStaticRecord]';
  }

  static toString() {
    return 'function ModuleStaticRecord() { [shim code] }';
  }
}

/**
 * Compartment()
 * The Compartment constructor is a global. A host that wants to execute
 * code in a context bound to a new global creates a new compartment.
 */
const privateFields = new WeakMap();

export class Compartment {
  constructor(endowments, modules, options = {}) {
    // Extract options, and shallow-clone transforms.
    const { transforms = [] } = options;
    const globalTransforms = [...transforms];

    const realmRec = getCurrentRealmRec();
    const globalObject = createGlobalObject(realmRec, {
      globalTransforms,
    });

    assign(globalObject, endowments);

    privateFields.set(this, {
      globalTransforms,
      globalObject,
    });
  }

  get global() {
    return privateFields.get(this).globalObject;
  }

  /**
   * The options are:
   * "x": the source text of a program to execute.
   */
  evaluate(x, options = {}) {
    // Perform this check first to avoid unecessary sanitizing.
    if (typeof x !== 'string') {
      throw new TypeError('first argument of evaluate() must be a string');
    }

    // Extract options, and shallow-clone transforms.
    const {
      endowments = {},
      transforms = [],
      sloppyGlobalsMode = false,
    } = options;
    const localTransforms = [...transforms];

    const { globalTransforms, globalObject } = privateFields.get(this);
    const realmRec = getCurrentRealmRec();
    return performEval(realmRec, x, globalObject, endowments, {
      globalTransforms,
      localTransforms,
      sloppyGlobalsMode,
    });
  }

  // eslint-disable-next-line class-methods-use-this
  toString() {
    return '[object Compartment]';
  }

  static toString() {
    return 'function Compartment() { [shim code] }';
  }
}
