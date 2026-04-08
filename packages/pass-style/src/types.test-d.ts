/* eslint-disable */
import { ONE_N } from '@endo/nat';
import { expectAssignable, expectType, expectNotType } from 'tsd';
import { Far } from './make-far.js';
import { passStyleOf } from './passStyleOf.js';
import { makeTagged } from './makeTagged.js';
import type {
  Checker,
  CopyArrayInterface,
  CopyRecordInterface,
  CopyTagged,
  CopyTaggedInterface,
  Passable,
  PassableCap,
  PassStyle,
} from './types.js';
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
expectType<'bigint'>(passStyleOf(ONE_N));
expectType<'symbol'>(passStyleOf(passableSymbolForName('foo')));
expectType<'null'>(passStyleOf(null));
expectType<'promise'>(passStyleOf(Promise.resolve()));
expectType<'error'>(passStyleOf(new Error()));
expectType<'tagged'>(passStyleOf(copyTagged));
expectType<'copyArray'>(passStyleOf([]));
// readonly / `as const` arrays classify as copyArray
expectType<'copyArray'>(passStyleOf([1, 2, 3] as const));
const roArr: readonly number[] = [1, 2, 3];
expectType<'copyArray'>(passStyleOf(roArr));

// The three container interfaces are exported and usable as types.
expectAssignable<CopyArrayInterface<PassableCap, Error>>([1, 'two', null]);
expectAssignable<CopyRecordInterface<PassableCap, Error>>({ a: 1, b: 'two' });
expectAssignable<CopyTaggedInterface<PassableCap, Error>>(copyTagged);
expectType<'copyRecord'>(passStyleOf({}));
// though the object is specifying a PASS_STYLE, it doesn't match the case for extracting it
expectType<'copyRecord'>(passStyleOf({ [PASS_STYLE]: 'arbitrary' } as const));
expectType<'remotable'>(passStyleOf(remotable));
expectType<PassStyle>(passStyleOf(someUnknown));

const expectPassable = (val: Passable) => {};

const fn = () => {};

expectPassable(1);
expectPassable(null);
expectPassable('str');
expectPassable(undefined);
// void is really `undefined`, and thus Passable
expectPassable(fn());

expectPassable({});
expectPassable({ a: {} });
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

expectAssignable<Checker>((cond: boolean, details?: unknown) => cond);
