/* eslint-disable */
import { expectAssignable, expectType, expectNotType } from 'tsd';
import { Far } from './make-far';
import { passStyleOf } from './passStyleOf';
import { makeTagged } from './makeTagged';
import {
  CopyTagged,
  Passable,
  PassableCap,
  PassStyle,
  PureData,
} from './types';
import { PASS_STYLE } from './passStyle-helpers';

const remotable = Far('foo', {});

const copyTagged = makeTagged('someTag', remotable);
expectType<CopyTagged<'someTag', typeof remotable>>(copyTagged);

const someUnknown: unknown = null;

expectType<'undefined'>(passStyleOf(undefined));
expectType<'string'>(passStyleOf('str'));
expectType<'boolean'>(passStyleOf(true));
expectType<'number'>(passStyleOf(1));
expectType<'bigint'>(passStyleOf(1n));
expectType<'symbol'>(passStyleOf(Symbol.for('foo')));
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
const expectPureData = (val: PureData) => {
  expectPassable(val);
};
const expectPassableCap = (val: PassableCap) => {
  expectPassable(val);
};

const fn = () => {};

expectPureData(1);
expectPureData(null);
expectPureData('str');
expectPureData(undefined);
// void is really `undefined`, and thus pure-data Passable
expectPureData(fn());

expectPureData({});
expectPureData({ a: {} });
// @ts-expect-error not passable
expectPassable(fn);
// @ts-expect-error Promise for not passable
expectPassable(Promise.resolve(fn));
// @ts-expect-error not passable
expectPassable({ a: { b: fn } });

expectPassable(remotable);
expectPassableCap(remotable);
// @ts-expect-error not pure-data
expectPureData(remotable);
expectPassable({ a: remotable });
// @ts-expect-error not passable capability
expectPassableCap({ a: remotable });
// @ts-expect-error not pure-data
expectPureData({ a: remotable });
expectPassable(copyTagged);
// @ts-expect-error not passable capability
expectPassableCap(copyTagged);
// @ts-expect-error not pure-data
expectPureData(copyTagged);
expectPassable(Promise.resolve(remotable));
expectPassableCap(Promise.resolve(remotable));
// @ts-expect-error not pure-data
expectPureData(Promise.resolve(remotable));
expectPassable({ a: Promise.resolve(remotable) });
// @ts-expect-error not passable capability
expectPassableCap({ a: Promise.resolve(remotable) });
// @ts-expect-error not pure-data
expectPureData({ a: Promise.resolve(remotable) });
// @ts-expect-error Promise for not passable
expectPassable({ a: Promise.resolve(fn) });
