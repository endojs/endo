import { expectType, expectNotType } from 'tsd';

import type { PrimitiveStyle } from '@endo/pass-style';

expectType<PrimitiveStyle>('string');
expectType<PrimitiveStyle>('number');
// @ts-expect-error
expectType<PrimitiveStyle>(1);
// @ts-expect-error
expectType<PrimitiveStyle>('str');
