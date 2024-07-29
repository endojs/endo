export type ThunkFn<HookArg, HookResult> = (arg: HookArg) => HookResult;

export type TrampolineGeneratorFn<
  TInitial,
  TArg = TInitial,
  TResult = TArg,
  Thunk extends ThunkFn<TArg, TResult> = ThunkFn<TArg, TResult>,
> = (
  thunkFn: Thunk,
  initial: TInitial,
) => Generator<TResult, Awaited<TResult>, Awaited<TResult>>;

export type SyncTrampolineGeneratorFn<
  TInitial,
  TArg = TInitial,
  TResult = TArg,
  Thunk extends ThunkFn<TArg, TResult> = ThunkFn<TArg, TResult>,
> =
  TResult extends Promise<any>
    ? never
    : (
        thunkFn: Thunk,
        initial: TInitial,
      ) => Generator<TResult, TResult, TResult>;
