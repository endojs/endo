// @ts-check

/** @typedef {import('@endo/ses-ava/prepare-endo.js').default} Test */

import test from '@endo/ses-ava/test.js';

const strictTextDecoder = new TextDecoder('utf-8', { fatal: true });

/**
 * @param {Test} t
 * @param {() => void} fn
 * @param {object} errorShape
 * @returns {void}
 * Like t.throws, but with a more flexible error shape (allows error.cause)
 */
export const throws = (t, fn, errorShape) => {
  try {
    fn();
  } catch (error) {
    t.like(error, errorShape);
    return;
  }
  t.fail('Expected error');
};

/**
 * @param {Uint8Array} bytes
 * @returns {{isValidUtf8: boolean, value: string | undefined}}
 */
export const maybeDecode = bytes => {
  try {
    return {
      isValidUtf8: true,
      value: strictTextDecoder.decode(bytes),
    };
  } catch (error) {
    return {
      isValidUtf8: false,
      value: undefined,
    };
  }
};

const logErrorCauseChain = (t, error, testName) => {
  const causes = [];
  let current = error;
  while (current) {
    causes.push(current);
    current = current.cause;
  }
  t.log(`Function threw for ${testName}:`);
  for (const [index, cause] of causes.entries()) {
    t.log(`Error chain, depth ${index}:`);
    t.log(cause.stack);
  }
};

/**
 * @param {Test} t
 * @param {() => void} fn
 * @param {string} testName
 * @returns {void}
 */
export const notThrowsWithErrorUnwrapping = (t, fn, testName) => {
  try {
    fn();
  } catch (error) {
    logErrorCauseChain(t, error, testName);
    t.fail(`Function threw. ${error}`);
  }
};

/**
 * @param {Test} t
 * @param {(t: Test) => Promise<void>} asyncFn
 * @param {string} testName
 * @returns {Promise<void>}
 */
export const notThrowsWithErrorUnwrappingAsync = async (
  t,
  asyncFn,
  testName,
) => {
  try {
    // eslint-disable-next-line @jessie.js/safe-await-separator
    await asyncFn(t);
  } catch (error) {
    logErrorCauseChain(t, error, testName);
    t.fail(`Function threw. ${error}`);
  }
};

export const testWithErrorUnwrapping = (testName, fn) => {
  return test(testName, t => {
    return notThrowsWithErrorUnwrappingAsync(t, fn, testName);
  });
};
testWithErrorUnwrapping.only = (testName, fn) => {
  return test.only(testName, t => {
    return notThrowsWithErrorUnwrappingAsync(t, fn, testName);
  });
};
