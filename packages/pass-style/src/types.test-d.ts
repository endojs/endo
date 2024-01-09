/* eslint-disable */
import { expectType, expectNotType } from 'tsd';
import { Far } from './make-far';
import { passStyleOf } from './passStyleOf';
import { makeTagged } from './makeTagged';
import { CopyTagged } from './types';
import { PASS_STYLE } from './passStyle-helpers';

const remotable = Far('foo', {});

const copyTagged = makeTagged('someTag', remotable);
expectType<CopyTagged<'someTag', typeof remotable>>(copyTagged);

const arbitraryStyled = { [PASS_STYLE]: 'arbitrary' } as const;

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
expectType<'arbitrary'>(passStyleOf(arbitraryStyled));
// @ts-expect-error
expectType<'foo'>(passStyleOf(arbitraryStyled));
expectType<'remotable'>(passStyleOf(remotable));
