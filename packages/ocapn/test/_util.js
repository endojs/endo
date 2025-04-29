const strictTextDecoder = new TextDecoder('utf-8', { fatal: true });

/**
 * @param {import('ava').Test} t
 * @param {() => void} fn
 * @param {object} errorShape
 * @returns {void}
 * Like t.throws, but with a more flexible error shape (allows error.cause).
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
 * @param {import('ava').Test} t
 * @param {() => void} fn
 * @param {string} testName
 * @returns {void}
 * Like t.notThrows, but logs the full error chain.
 */
export const notThrowsWithErrorUnwrapping = (t, fn, testName) => {
  try {
    fn();
  } catch (error) {
    const causes = [];
    let current = error;
    while (current) {
      causes.push(current);
      current = current.cause;
    }
    t.log(`Function threw for ${testName}:`);
    t.log(causes);
    t.fail(`Function threw. ${error}`);
  }
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
