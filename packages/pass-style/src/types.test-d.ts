/* eslint-disable */
import { expectAssignable, expectType, expectNotType } from 'tsd';
import { Far } from './make-far.js';
import { passStyleOf } from './passStyleOf.js';
import { makeTagged } from './makeTagged.js';
import type { Checker, CopyArray, CopyReadonlyArray, CopyTagged, Passable, PassStyle } from './types.js';
import { PASS_STYLE } from './passStyle-helpers.js';
import { passableSymbolForName } from './symbol.js';

const remotable = Far('foo', {});

const copyTagged = makeTagged('someTag', remotable);
expectType<CopyTagged<'someTag', typeof remotable>>(copyTagged);

const someUnknown: unknown = null;

expectType<'undefined'>(passStyleOf(undefined));
expectType<'string'>(passStyleOf('str'));
expectType<'boolean'>(passStyleOf(true));
expectType<'number'>(passStyleOf(1));
expectType<'bigint'>(passStyleOf(1n));
expectType<'symbol'>(passStyleOf(passableSymbolForName('foo')));
expectType<'null'>(passStyleOf(null));
expectType<'promise'>(passStyleOf(Promise.resolve()));
expectType<'error'>(passStyleOf(new Error()));
expectType<'tagged'>(passStyleOf(copyTagged));
expectType<'copyArray'>(passStyleOf([]));
expectType<'copyRecord'>(passStyleOf({}));
// though the object is specifying a PASS_STYLE, it doesn't match the case for extracting it
expectType<'copyRecord'>(passStyleOf({ [PASS_STYLE]: 'arbitrary' } as const));
expectType<'remotable'>(passStyleOf(remotable));
expectType<PassStyle>(passStyleOf(someUnknown));

const expectPassable = (val: Passable) => {};

const fn = () => {};

// CopyArray is mutable, so we can test mutation methods.
const arr: CopyArray<number> = [];
arr.push(1);
arr.slice(0, 1);
arr.shift();
expectPassable(arr);

// Not so for CopyReadonlyArray.
const roArr: CopyReadonlyArray<number> = [];
// @ts-expect-error not mutable
roArr.push(1);
roArr.slice(0, 1);
// @ts-expect-error not mutable
roArr.shift();
expectPassable(roArr);

expectPassable(1);
expectPassable(null);
expectPassable('str');
expectPassable(undefined);
// void is really `undefined`, and thus Passable
expectPassable(fn());

expectPassable({});
expectPassable({ a: {} });
expectPassable({ a: { b: {} } });
expectPassable(['car', 'cdr']);
expectPassable(['car', 'cdr'] as string[]);
expectPassable([['a'], ['b']] as const);
expectPassable(['car', 'cdr'] as Readonly<string[]>);
expectPassable(['car', 'cdr'] as Readonly<[string, string]>);
// @ts-expect-error not passable
expectPassable(fn);
// FIXME promise for a non-Passable is not Passable
expectPassable(Promise.resolve(fn));
// @ts-expect-error not passable
expectPassable({ a: { b: fn } });

expectPassable(remotable);
expectPassable({ a: remotable });
expectPassable(copyTagged);
expectPassable(Promise.resolve(remotable));
expectPassable({ a: Promise.resolve(remotable) });
expectPassable({ a: Promise.resolve(fn) });

expectAssignable<Checker>((cond: boolean, details: string) => cond);
