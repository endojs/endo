import { expectType } from 'tsd';

import { Far, type AtomStyle, type RemotableObject } from '@endo/pass-style';
import { makeMarshal } from './marshal.js';

expectType<AtomStyle>('string');
expectType<AtomStyle>('number');
// @ts-expect-error
expectType<AtomStyle>(1);
// @ts-expect-error
expectType<AtomStyle>('str');

type KCap = RemotableObject & { getKref: () => string; iface: () => string };
const valToSlot = (s: KCap) => s.getKref();
const slotToVal = (s: string) => null as unknown as KCap;
const marshal = makeMarshal(valToSlot, slotToVal);
const cycled = marshal.fromCapData(marshal.toCapData(null as unknown as KCap));
expectType<unknown>(cycled);

const m = makeMarshal();
const foo1 = Far('foo', { getBoardId: () => 'board1' });
const foo2 = Far('foo', { getBoardId: () => 'board2' });
const bar1 = Far('bar', { getBoardId: () => 'board1' });
m.toCapData(harden({ o: foo1 }));
m.toCapData(harden({ o: foo2 }));
m.toCapData(harden({ o: bar1 }));
