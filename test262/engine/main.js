/**
 * test-test262.js
 * This test executes all tests found in the root test262/test
 * directory, except tests designated to be skipped by path or
 * by the description in their front matter.
 */

import tape from 'tape';
import mixedTape from 'mixed-tape';
import fs from 'fs';
import path from 'path';
import test262Parser from 'test262-parser';
import Evaluator from '../../src/evaluator';
import { injectHarness } from './harness';

const test = mixedTape(tape);

/* eslint-disable no-proto, no-extend-native, no-underscore-dangle */

const excludePaths = [
  '_FIXTURE.js', // test262 convention, does not contain tests.
  'built-ins/eval/private-identifiers-not-empty.js',
  'built-ins/function/15.3.2.1-11-1.js',
  'built-ins/function/15.3.2.1-11-2-s.js',
  'built-ins/function/15.3.2.1-11-3.js',
  'built-ins/function/15.3.2.1-11-4-s.js',
  'built-ins/function/15.3.2.1-11-5.js',
  'built-ins/function/15.3.2.1-11-6-s.js',
  'built-ins/function/15.3.2.1-11-7-s.js',
  'built-ins/function/15.3.2.1-11-8-s.js',
  'built-ins/function/15.3.2.1-11-9-s.js',
  'built-ins/function/15.3.5.4_2-11gs.js',
  'built-ins/function/15.3.5.4_2-13gs.js',
  'built-ins/function/15.3.5.4_2-7gs.js',
  'built-ins/function/15.3.5.4_2-9gs.js',
  'built-ins/function/call-bind-this-realm-undef.js',
  'built-ins/function/call-bind-this-realm-value.js',
  'built-ins/function/S15.3.2.1_A3_T1.js',
  'built-ins/function/S15.3.2.1_A3_T3.js',
  'built-ins/function/S15.3.2.1_A3_T6.js',
  'built-ins/function/S15.3.2.1_A3_T8.js',
  'built-ins/function/S15.3.5_A2_T1.js',
  'built-ins/function/S15.3.5_A2_T2.js',
  'built-ins/function/S15.3_A3_T1.js',
  'built-ins/function/S15.3_A3_T2.js',
  'built-ins/function/S15.3_A3_T3.js',
  'built-ins/function/S15.3_A3_T4.js',
  'built-ins/function/S15.3_A3_T5.js',
  'built-ins/function/S15.3_A3_T6.js',
];
const excludeFeatures = [];
const excludeFlags = [
  'noStrict', // TODO: Evaluator does not support sloppy mode.
];
const sourceTextCorrections = [
  [/\/\*---.*---\*\//s, ''], // strip front matter to avoid false positives
  [/eval\./g, '(0, eval).'], // simple fix to unblock tests
  [/eval,/g, '(0, eval),'], // simple fix to unblock tests
  [/new eval\(/g, 'new (0, eval)('], // simple fix to unblock tests
  [/\(f\.constructor !== Function\)/g, '(!(f instanceof Function))'], // shim limitation
];

const excludeDescriptions = []; // used while debugging
const excludeErrors = []; // used while debugging

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
  return { contents, ...file.attrs };
}

/**
 * Given the relative path to a test, return true if the test must
 * be skiped because it contains a blacklisted path segment. We use
 * the relative path to avoid a false positive on the root path.
 */
function hasExcludedPath(filePath) {
  if (typeof filePath === 'string') {
    if (excludePaths.some(exclude => filePath.includes(exclude))) {
      return true;
    }
  }
  return false;
}

/**
 * Given a test description (from the font matter), return
 * true if its beginging is found in the excluded list.
 */
function hasExcludedDescription(description) {
  if (typeof description === 'string') {
    if (excludeDescriptions.some(exclude => description.startsWith(exclude))) {
      return true;
    }
  }
  return false;
}

/**
 * Given a test features array (from the font matter), return
 * true if one feature is in the excluded list.
 */
function hasExcludedFeatures(features) {
  if (Array.isArray(features)) {
    if (excludeFeatures.some(exclude => features.contains(exclude))) {
      return true;
    }
  }
  return false;
}

/**
 * Given a test flags (from the font matter), return
 * true if one flag is in the excluded list.
 */
function hasExcludedFlag(flags) {
  if (typeof flags === 'object') {
    // eslint-disable-next-line no-prototype-builtins
    if (excludeFlags.some(exclude => flags.hasOwnProperty(exclude))) {
      return true;
    }
  }
  return false;
}

/**
 * Given a test info (the parsed front matter of a test), return
 * true if the test must be skipped based on its description
 * or features.
 */
function hasExcludedInfo({ description, features, flags }) {
  return (
    hasExcludedDescription(description) ||
    hasExcludedFeatures(features) ||
    hasExcludedFlag(flags)
  );
}

function getTestTranforms() {
  return [
    {
      rewrite(rewriterState) {
        sourceTextCorrections.forEach(correction => {
          rewriterState.src = rewriterState.src.replace(...correction);
        });
        return rewriterState;
      },
    },
  ];
}

function isExcludedError(errorObject) {
  const error = `${errorObject}`;
  if (excludeErrors.some(exclude => error.includes(exclude))) {
    return true;
  }

  return false;
}

/**
 * Create a skipped test. At truntime, the skipped test will be
 * listed and prefixed by `# SKIP`, allowing for easy monitoring.
 * Only the filename is displayed in the output.
 */
function skipTest(testInfo, rootPath, relativePath) {
  const displayPath = relativePath.replace('./', '');
  test(displayPath, { skip: true });
}

/**
 * Create and execute a test using a new module importer. The test
 * filemane, esid, and description are displayed in the output.
 */
function executeTest(testInfo, rootPath, relativePath) {
  const displayPath = relativePath.replace('./', '');

  test(displayPath, t => {
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
      const transforms = getTestTranforms();
      const evaluator = new Evaluator({ transforms });
      injectHarness(evaluator.global, t);
      evaluator.evaluateScript(testInfo.contents);
    } catch (e) {
      if (testInfo.negative) {
        if (e.constructor.name !== testInfo.negative.type) {
          // Display the unexpected error.
          t.error(e, 'unexpected error');
        } else {
          // Diplay that the error matched.
          t.pass(`should throw ${testInfo.negative.type}`);
        }
      } else if (isExcludedError(e)) {
        t.skip(e);
      } else {
        // Only negative tests are expected to throw.
        t.error(e, 'should not throw');
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
  const TamedFunction = function Function() {
    throw new TypeError('Not available');
  };
  Object.defineProperties(Function.prototype, {
    constructor: { value: TamedFunction },
  });
  Object.defineProperties(TamedFunction, {
    prototype: { value: Function.prototype },
  });

  const rootPath = path.join(__dirname, '../../test262/test');

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

/* eslint-enable no-proto, no-extend-native, no-underscore-dangle */
