/**
 * The final output of `asyncTrampoline()`, which will be wrapped in a `Promise`.
 */
export type TrampolineResult<
  TGeneratorFn extends (...args: any[]) => Generator = (
    ...args: any[]
  ) => Generator,
> = TGeneratorFn extends (...args: any[]) => Generator<any, infer TResult>
  ? TResult
  : never;

/**
 * The final output of `syncTrampoline()`
 */
export type SyncTrampolineResult<
  TGeneratorFn extends (...args: any[]) => Generator = (
    ...args: any[]
  ) => Generator,
> =
  TrampolineResult<TGeneratorFn> extends Promise<any>
    ? never
    : TrampolineResult<TGeneratorFn>;
