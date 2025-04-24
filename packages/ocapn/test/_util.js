/**
 * @param {import('ava').Test} t
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
