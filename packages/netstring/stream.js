// @ts-check

export const moduleOnlyExportsTypes = true;

/**
 * Stream satisfies AsyncGenerator, and no arguments are optional.
 *
 * @template GetType
 * @template GiveType
 * @template FinaType
 * @typedef {{
 *   next(value: GiveType): Promise<IteratorResult<GetType>>,
 *   return(value: FinaType): Promise<IteratorResult<GetType>>,
 *   throw(error: Error): Promise<IteratorResult<GetType>>,
 *   [Symbol.asyncIterator](): Stream<GetType, GiveType, FinaType>
 * }} Stream
 */
