/* eslint-disable no-redeclare */
import { expectAssignable, expectNever, expectNotType, expectType } from 'tsd';
import { trampoline, syncTrampoline } from '../src/trampoline.js';
import {
  SyncThunkFn,
  SyncTrampolineGeneratorFn,
  ThunkFn,
  TrampolineGeneratorFn,
} from '../src/types.js';

function syncHook(x: number): number {
  return x;
}

async function asyncHook(x: number): Promise<string> {
  await Promise.resolve();
  return `${x}`;
}

expectAssignable<ThunkFn<number, number>>(syncHook);

expectAssignable<ThunkFn<number, Promise<string>>>(asyncHook);

function* simple<
  TResult extends string | Promise<string>,
  Thunk extends ThunkFn<string, TResult>,
>(thunk: Thunk, initial: string): Generator<TResult, string, string> {
  const hello = yield thunk(initial);
  return `${hello} world`;
}

expectAssignable<TrampolineGeneratorFn<string>>(simple);

expectAssignable<SyncTrampolineGeneratorFn<string>>(simple);

expectType<string>(
  syncTrampoline(simple, (str: string) => `${str} cruel`, 'goodbye'),
);

expectType<Promise<string>>(
  trampoline(simple, async (str: string) => `${str} cruel`, 'goodbye'),
);

expectType<Promise<string>>(
  trampoline(simple, (str: string) => `${str} cruel`, 'goodbye'),
);
