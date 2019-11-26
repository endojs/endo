/**
 * test-test262.js
 * This test executes all tests found in the root test262/test
 * directory, except tests designated to be skipped by path or
 * by the description in their front matter.
 */

/* eslint-disable no-throw-literal, func-names, no-underscore-dangle, no-self-compare */

import { test } from 'tape-promise/tape';
import { makeEvaluators } from '@agoric/evaluate';
import {
  makeModuleTransformer,
  makeModuleAnalyzer,
} from '@agoric/transform-module';
import * as babelCore from '@babel/core';
import fs from 'fs';
import path from 'path';
import inspect from 'object-inspect';
import test262Parser from 'test262-parser';

import makeImporter, * as mi from '../src';

const readFile = ({ pathname }) =>
  fs.promises
    .readFile(pathname, 'utf-8')
    .then(str => ({ type: 'module', string: str }));

const protoHandlers = { 'file:': readFile };
const typeAnalyzers = { module: makeModuleAnalyzer(babelCore) };

/**
 * Recursively find all *.js files in a directory tree.
 */
async function* getJSFiles(dir) {
  const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const dirent of dirents) {
    const res = path.resolve(dir, dirent.name);
    if (dirent.isDirectory()) {
      yield* getJSFiles(res);
    } else if (dirent.isFile() && dirent.name.endsWith('.js')) {
      yield res;
    }
  }
}

/**
 * Read a test file and return the parsed front matter.
 */
function readTestInfo(filePath) {
  const contents = fs.readFileSync(filePath, 'utf-8');
  const file = { contents };
  test262Parser.parseFile(file);
  return file.attrs;
}

/**
 * Given the relative path to a test, return true if the test must
 * be skiped because it contains a blacklisted path segment. We use
 * the relative path to avoid a false positive on the root path.
 */
function hasExcludedPath(relativePath) {
  const excludePaths = [
    '/import.meta/', // todo
    '/import-meta.js', // todo
    '/dynamic-import/', // todo
    '/top-level-await/', // not supported as documented
    '_FIXTURE.js', // does not contain tests
  ];
  if (excludePaths.some(exclude => relativePath.includes(exclude))) {
    return true;
  }

  return false;
}

/**
 * Given a test info (the parsed front matter of a test), return
 * true if the test must be skipped based on its description
 * or features.
 */
function hasExcludedInfo(testInfo) {
  const { description, flags, features } = testInfo;
  if (typeof flags === 'object') {
    if (!flags.module) return true; // todo
  }
  if (Array.isArray(features)) {
    // if (features.includes('dynamic-import')) return true;
  }
  if (typeof description === 'string') {
    const excludePaths = [
      'Imported binding reflects state', // not supported as documented
      'Binding is created', // not supported as documented
      'Mutable bindings', // not supported as documented
      'Immutable binding', // not supported as documented
      'Test Object.prototype.propertyIsEnumerable() with uninitialized binding', // not supported as documented
      'Test Object.prototype.hasOwnProperty() with uninitialized binding', // not supported as documented
      'Test Object.keys() with uninitialized binding', // not supported as documented
      'An ImportClause may contain both an ImportedDefaultBinding and a NameSpaceImport', // not supported as documented
      'An ImportClause may contain both an ImportedDefaultBinding and NamedImports', // not supported as documented
      'Test for-in enumeration with uninitialized binding', // not supported as documented

      // skipped until related issue is resolved
      // some tests fail because they rely on a side effect which is failing
      // resolving an issue might uncover another issue

      // 'Statement cannot contain an `import` declaration', // https://github.com/Agoric/transform-module/issues/5
      // 'Expression cannot contain an `import` declaration', // https://github.com/Agoric/transform-module/issues/5
      // 'Statement cannot contain an `export` declaration', // https://github.com/Agoric/transform-module/issues/5
      // 'Expression cannot contain an `export` declaration', // https://github.com/Agoric/transform-module/issues/5

      // 'Default AssignmentExpression (which can be recognized as an "anonymous"', // https://github.com/Agoric/make-importer/issues/10

      // 'An exported default "anonymous"', // https://github.com/Agoric/make-importer/issues/12
      // 'Default "anonymous', // https://github.com/Agoric/make-importer/issues/12
      // 'An exported default "named"', // https://github.com/Agoric/make-importer/issues/12

      // 'The [[OwnPropertyKeys]] internal method reflects the sorted order', // https://github.com/Agoric/make-importer/issues/24

      'Behavior of the [[HasProperty]] internal method', // https://github.com/Agoric/make-importer/issues/?
      'Behavior of the [[GetOwnProperty]] internal method', // https://github.com/Agoric/make-importer/issues/?
      'Behavior of the [[Get]] internal method', // https://github.com/Agoric/make-importer/issues/?
      'The [[OwnPropertyKeys]] internal method', // https://github.com/Agoric/make-importer/issues/?
      'The [[IsExtensible]] internal method', // https://github.com/Agoric/make-importer/issues/?
      'The [[Set]] internal method', // https://github.com/Agoric/make-importer/issues/?
      '[[Delete]] behavior', // https://github.com/Agoric/make-importer/issues/?
      'The [[DefineOwnProperty]] internal method', // https://github.com/Agoric/make-importer/issues/?
      'References observe the mutation of initialized bindings', // https://github.com/Agoric/make-importer/issues/?

      'Modules can be visited more than once', // https://github.com/Agoric/make-importer/issues/27

      // 'Ambiguous exports are not reflected', // https://github.com/Agoric/make-importer/issues/28

      '`Symbol.toStringTag` property descriptor', // https://github.com/Agoric/make-importer/issues/29

      // 'Hashbang comments', // https://github.com/Agoric/make-importer/issues/34

      // 'The class-name is present', // https://github.com/Agoric/make-importer/issues/35

      'Module is evaluated exactly once', // https://github.com/Agoric/make-importer/issues/36
      // 'Requested modules are evaluated exactly once', // https://github.com/Agoric/make-importer/issues/36

      'The [[SetPrototypeOf]] internal method returns `false`', // https://github.com/Agoric/make-importer/issues/39

      // 'References observe the initialization of lexical bindings', // https://github.com/Agoric/make-importer/issues/40
      // 'References observe the mutation of initialized bindings', // https://github.com/Agoric/make-importer/issues/40

      // 'Requested modules are evaluated prior to the requesting module in source code order', // https://github.com/Agoric/make-importer/issues/43

      'Modifications to default binding that occur after dependency has been evaluated', // https://github.com/Agoric/make-importer/issues/12

      // 'Abrupt completion during module evaluation', // https://github.com/Agoric/make-importer/issues/44
    ];
    return excludePaths.some(exclude => description.startsWith(exclude));
  }
  return false;
}

/**
 * Create a new (and related) pair of evaluator and importer.
 */
function makeEvaluatorAndImporter(rootUrl) {
  const transforms = [];
  const { evaluateProgram } = makeEvaluators({ transforms });
  const importer = makeImporter({
    resolve: mi.makeRootedResolver(rootUrl),
    locate: mi.makeSuffixLocator('.js'),
    retrieve: mi.makeProtocolRetriever(protoHandlers),
    analyze: mi.makeTypeAnalyzer(typeAnalyzers),
    rootLinker: mi.makeEvaluateLinker(evaluateProgram),
  });
  transforms[0] = makeModuleTransformer(babelCore, importer);
  return { evaluateProgram, importer };
}

/**
 * Attach a test harness to the global object. We use the global object,
 * not the endowments, because test262 looks for the test harness on the
 * global object.
 */
function injectTest262Harness(globalObject, t) {
  // ===
  // from test262/harness/sta.js
  // An error class to avoid false positives when testing for thrown exceptions
  // A function to explicitly throw an exception using the Test262Error class
  function Test262Error(message) {
    this.message = message || '';
  }

  Test262Error.prototype.toString = function() {
    return `Test262Error: ${this.message}`;
  };

  function $ERROR(message) {
    throw new Test262Error(message);
  }

  function $DONOTEVALUATE() {
    throw 'Test262: This statement should not be evaluated.';
  }

  Object.assign(globalObject, {
    Test262Error,
    $ERROR,
    $DONOTEVALUATE,
  });

  // ===
  // from test262/harness/assert.js
  // Collection of assertion functions used throughout test262
  const assert = function assert(condition, message) {
    t.ok(condition, message);
  };

  assert._isSameValue = function(a, b) {
    if (a === b) {
      // Handle +/-0 vs. -/+0
      return a !== 0 || 1 / a === 1 / b;
    }

    // Handle NaN vs. NaN
    return a !== a && b !== b;
  };

  assert.sameValue = function(found, expected, message) {
    if (assert._isSameValue(found, expected)) {
      t.pass(message);
    } else {
      const ex = inspect(expected);
      const ac = inspect(found);

      t.fail(
        `${message || ''} operator: sameValue expected: ${ex} actual: ${ac}`,
      );
    }
  };

  assert.notSameValue = function(found, expected, message) {
    if (!assert._isSameValue(found, expected)) {
      t.pass(message);
    } else {
      const ex = inspect(expected);
      const ac = inspect(found);

      t.fail(
        `${message || ''} operator: notSameValue expected: ${ex} actual: ${ac}`,
      );
    }
  };

  assert.throws = function(expectedErrorConstructor, func, message) {
    t.throws(func, expectedErrorConstructor, message);
  };

  Object.assign(globalObject, { assert });

  // ===
  // from test262/harness/fnGlobalObject.js
  // Produce a reliable global object
  function fnGlobalObject() {
    return globalObject;
  }

  Object.assign(globalObject, { fnGlobalObject });

  // ===
  // from test262/harness/doneprintHandle.js

  function __consolePrintHandle__(msg) {
    t.message(msg);
  }

  function $DONE(error) {
    if (error) {
      if (typeof error === 'object' && error !== null && 'name' in error) {
        t.fail(`Test262:AsyncTestFailure: ${error.name}: ${error.message}`);
      } else {
        t.fail(`Test262:AsyncTestFailure:Test262Error: ${error}`);
      }
    } else {
      t.pass('Test262:AsyncTestComplete');
    }
  }

  Object.assign(globalObject, { __consolePrintHandle__, $DONE });
}

/**
 * Create a skipped test. At truntime, the skipped test will be
 * listed and prefixed by `# SKIP`, allowing for easy monitoring.
 * Only the filename is displayed in the output.
 */
function skipTest(testInfo, rootPath, relativePath) {
  const displayPath = relativePath.replace('./', 'test262/');
  test(displayPath, { skip: true });
}

/**
 * Create and execute a test using a new module importer. The test
 * filemane, esid, and description are displayed in the output.
 */
function executeTest(testInfo, rootPath, relativePath) {
  const displayPath = relativePath.replace('./', 'test262/');

  test(displayPath, async t => {
    // Provide information about the test.
    if (
      typeof testInfo === 'object' &&
      typeof testInfo.description === 'string'
    ) {
      const esid = testInfo.esid || '(no esid)';
      const description = testInfo.description || '(no description)';
      t.comment(`${esid}: ${description}`);
    }

    try {
      const rootUrl = `file://${rootPath}`;
      const { evaluateProgram, importer } = makeEvaluatorAndImporter(rootUrl);

      // Populate the global
      const globalObject = evaluateProgram('Function("return this")()');
      injectTest262Harness(globalObject, t);

      await importer({ spec: relativePath, url: `${rootUrl}/` }, {});
    } catch (e) {
      if (testInfo.negative) {
        if (e.constructor.name !== testInfo.negative.type) {
          // Display the unexpected error.
          t.isNot(e, e, 'unexpected error');
        } else {
          // Display that the error matched.
          t.pass(`should throw ${testInfo.negative.type}`);
        }
      } else {
        // Only negative tests are expected to throw.
        t.isNot(e, e, 'should not throw');
      }
    } finally {
      t.end();
    }
  });
}

/**
 * Main.
 */
(async () => {
  const rootPath = path.join(__dirname, '../test262/test');

  for await (const filePath of getJSFiles(rootPath)) {
    const relativePath = filePath.replace(rootPath, '.');
    const testInfo = readTestInfo(filePath);
    if (hasExcludedPath(relativePath) || hasExcludedInfo(testInfo)) {
      skipTest(testInfo, rootPath, relativePath);
    } else {
      executeTest(testInfo, rootPath, relativePath);
    }
  }
})();
