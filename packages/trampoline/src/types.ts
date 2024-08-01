/**
 * A {@link TrampolineGeneratorFn} will yield the result of calling this
 * function
 */
export type ThunkFn<TArg, TResult = TArg> = (arg: TArg) => TResult;

/**
 * A {@link SyncTrampolineGeneratorFn} or {@link TrampolineGeneratorFn} will
 * yield the result of calling this function
 */
export type SyncThunkFn<TArg, TResult = TArg> =
  TResult extends Promise<any> ? never : (arg: TArg) => TResult;

/**
 * A function type that represents a generator function for trampolining.
 *
 * @template TInitial - The type of the initial value.
 * @template TArg - The type of the argument passed to the thunk function.
 * Defaults to `TInitial`.
 * @template TResult - The type of the result produced by the thunk function.
 * Defaults to `TArg`.
 * @param thunk - The thunk function to be used in the generator.
 * @param initial - The initial value to start the generator.
 * @returns A generator that yields results of type `TResult`.
 */
export type TrampolineGeneratorFn<TInitial, TArg = TInitial, TResult = TArg> = (
  thunk: ThunkFn<TArg, TResult>,
  initial: TInitial,
) => Generator<TResult, Awaited<TResult>, Awaited<TResult>>;

/**
 * A function type that represents a synchronous generator function for
 * trampolining.
 *
 * This type ensures that the result type (`TResult`) is not a `Promise`. If
 * `TResult` extends `Promise`, the type resolves to `never`.
 *
 * @template TInitial - The type of the initial value.
 * @template TArg - The type of the argument passed to the thunk function.
 * Defaults to `TInitial`.
 * @template TResult - The type of the result produced by the thunk function.
 * Defaults to `TArg`.
 * @param thunk - The thunk function to be used in the generator.
 * @param initial - The initial value to start the generator.
 * @returns A generator that yields results of type `TResult`.
 */
export type SyncTrampolineGeneratorFn<
  TInitial,
  TArg = TInitial,
  TResult = TArg,
> = (
  thunk: ThunkFn<TArg, TResult>,
  initial: TInitial,
) => Generator<TResult, TResult, TResult>;
