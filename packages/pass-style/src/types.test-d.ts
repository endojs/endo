/* eslint-disable */
import { ONE_N } from '@endo/nat';
import { expectTypeOf } from 'expect-type';
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
expectTypeOf(copyTagged).toEqualTypeOf<
  CopyTagged<'someTag', typeof remotable>
>();

const someUnknown: unknown = null;

expectTypeOf(passStyleOf(undefined)).toEqualTypeOf<'undefined'>();
expectTypeOf(passStyleOf('str')).toEqualTypeOf<'string'>();
expectTypeOf(passStyleOf(true)).toEqualTypeOf<'boolean'>();
expectTypeOf(passStyleOf(1)).toEqualTypeOf<'number'>();
expectTypeOf(passStyleOf(ONE_N)).toEqualTypeOf<'bigint'>();
expectTypeOf(
  passStyleOf(passableSymbolForName('foo')),
).toEqualTypeOf<'symbol'>();
expectTypeOf(passStyleOf(null)).toEqualTypeOf<'null'>();
expectTypeOf(passStyleOf(Promise.resolve())).toEqualTypeOf<'promise'>();
expectTypeOf(passStyleOf(new Error())).toEqualTypeOf<'error'>();
expectTypeOf(passStyleOf(copyTagged)).toEqualTypeOf<'tagged'>();
expectTypeOf(passStyleOf([])).toEqualTypeOf<'copyArray'>();
// readonly / `as const` arrays classify as copyArray
expectTypeOf(passStyleOf([1, 2, 3] as const)).toEqualTypeOf<'copyArray'>();
const roArr: readonly number[] = [1, 2, 3];
expectTypeOf(passStyleOf(roArr)).toEqualTypeOf<'copyArray'>();

// The three container interfaces are exported and usable as types.
expectTypeOf([1, 'two', null]).toExtend<
  CopyArrayInterface<PassableCap, Error>
>();
expectTypeOf({ a: 1, b: 'two' }).toExtend<
  CopyRecordInterface<PassableCap, Error>
>();
expectTypeOf(copyTagged).toExtend<CopyTaggedInterface<PassableCap, Error>>();
expectTypeOf(passStyleOf({})).toEqualTypeOf<'copyRecord'>();
// though the object is specifying a PASS_STYLE, it doesn't match the case for extracting it
expectTypeOf(
  passStyleOf({ [PASS_STYLE]: 'arbitrary' } as const),
).toEqualTypeOf<'copyRecord'>();
expectTypeOf(passStyleOf(remotable)).toEqualTypeOf<'remotable'>();
expectTypeOf(passStyleOf(someUnknown)).toEqualTypeOf<PassStyle>();

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

expectTypeOf((cond: boolean, details?: unknown) => cond).toExtend<Checker>();
