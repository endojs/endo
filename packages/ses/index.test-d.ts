/* eslint-disable @endo/no-polymorphic-call, import/no-extraneous-dependencies */
import { expectType } from 'tsd';

import { Assert } from '.';

const assert: Assert = null as any;

const aString = 'string';
const aNumber = 1;

let maybeNumber: number | string = aNumber;

assert.typeof(maybeNumber, 'number');
expectType<number>(maybeNumber);

maybeNumber = 'string';
assert.typeof(maybeNumber, 'string');
expectType<string>(maybeNumber);
