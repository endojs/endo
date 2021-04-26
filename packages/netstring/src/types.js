// @ts-check

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
