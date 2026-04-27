// @ts-check
/**
 * Helpers for building and walking PromisedAnswer transform paths.
 *
 * A transform path is an array of `{ op: 'getPointerField', fieldOrdinal: N }`
 * (or `{ op: 'noop' }`) used by Cap'n Proto to address a pipelined sub-cap of
 * a question. Without a static schema we treat each step as targeting the
 * Nth pointer field of the result struct, which by Cap'n Proto convention
 * matches the pointer ordinal of the field. Our payload codec uses pointer
 * fields linearly, so the transform path mirrors property access on the
 * returned struct.
 */

/**
 * @param {Array<{op: string, fieldOrdinal?: number}>} prefix
 * @param {{ op: 'getPointerField', fieldOrdinal: number }} step
 */
export const extendPath = (prefix, step) => [...prefix, step];

/**
 * Look up a pipelined sub-cap of a resolved struct following a transform path.
 *
 * @param {unknown} value the resolved value of the question (typically an
 *   object whose properties were marked as caps in our payload codec)
 * @param {Array<{op: string, fieldOrdinal?: number}>} transform
 * @param {(idx: number) => unknown} pointerFieldByOrdinal
 *   Application-specific accessor that returns the Nth pointer field of
 *   `value`. Defaults are provided in the connection layer.
 */
export const followTransform = (value, transform, pointerFieldByOrdinal) => {
  let v = value;
  for (const op of transform) {
    if (op.op === 'noop') continue;
    if (op.op === 'getPointerField') {
      v = pointerFieldByOrdinal(/** @type {number} */ (op.fieldOrdinal));
    }
  }
  return v;
};
