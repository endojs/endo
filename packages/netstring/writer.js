// @ts-check

const COLON = ':'.charCodeAt(0);
const COMMA = ','.charCodeAt(0);

const encoder = new TextEncoder();

/**
 * @template T
 * @template U
 * @template V
 * @typedef {{
 *   next(value: U): Promise<IteratorResult<T>>,
 *   return(value: V): Promise<IteratorResult<T>>,
 *   throw(error: Error): Promise<IteratorResult<T>>,
 *   [Symbol.asyncIterator](): Stream<T, U, V>
 * }} Stream
 */

/**
 * @param {Stream<void, Uint8Array, void>} output
 * @returns {Stream<void, Uint8Array, void>}
 */
export function netstringWriter(output) {
  const scratch = new Uint8Array(8);

  return {
    async next(message) {
      const { written: length = 0 } = encoder.encodeInto(
        `${message.byteLength}`,
        scratch,
      );
      scratch[length] = COLON;

      const { done: done1 } = await output.next(
        scratch.subarray(0, length + 1),
      );
      if (done1) {
        return output.return();
      }

      const { done: done2 } = await output.next(message);
      if (done2) {
        return output.return();
      }

      scratch[0] = COMMA;
      return output.next(scratch.subarray(0, 1));
    },
    async return() {
      return output.return();
    },
    async throw(error) {
      return output.throw(error);
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}
