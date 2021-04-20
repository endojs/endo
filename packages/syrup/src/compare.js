// @ts-check

/**
 * @param {Uint8Array} left
 * @param {Uint8Array} right
 * @param {number} leftStart
 * @param {number} leftEnd
 * @param {number} rightStart
 * @param {number} rightEnd
 */
export function compareByteArrays(
  left,
  right,
  leftStart,
  leftEnd,
  rightStart,
  rightEnd,
) {
  const leftLength = leftEnd - leftStart;
  const rightLength = rightEnd - rightStart;
  for (;;) {
    // The prefixes so far are equal.
    if (leftStart >= leftEnd) {
      // We have reached the end of the left string.
      // The right string must be at least as long as the left: If the right
      // string were shorter than the left string, we would have returned out
      // of a prior iteration on one of the subsequent conditions.
      // So, the left string is either the same as the right string in both
      // length and content or the right string is longer.
      //   left === right
      //   comapre(left, right) === 0
      //   leftLength - rightLength === 0
      // If the right string is longer, then the left string is a prefix of the
      // right string and the left string should come before the right string,
      // and this algorithm should return -1
      //   left < right
      //   compare(left, right) < 0
      //   leftLength - rightLength < 0
      //   shorter - longer < 0
      return leftLength - rightLength;
    }
    if (rightStart >= rightEnd) {
      // We have reached the end of the left string.
      // We have not reached the end of the right string, otherwise we would
      // have exited out of the prior condition.
      // So, the right string must be longer than the left string.
      // The prefixes so far are equal
      // So, the left string is shorter than the right string.
      // So, the left string should be ordered before the right string.
      //   left < right
      //   compare(left, right) < 0
      return -1;
    }
    if (left[leftStart] < right[rightStart]) {
      // Since the prefixes are equal and the left byte is less than the right
      // byte, the left string should be sorted before the right string.
      //   left < right
      //   compare(left, right) < 0
      return -1;
    }
    if (left[leftStart] > right[rightStart]) {
      // Since the prefixes are equal and the left byte is greater than the
      // right byte, the left string should be sorted after the right string.
      //   left > right
      //   compare(left, right) > 0
      return 1;
    }
    leftStart += 1;
    rightStart += 1;
  }
}
