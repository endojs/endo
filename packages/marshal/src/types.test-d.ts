// `ConvertValToSlot` and its `val` parameter are the established public names in
// the @endo/marshal type surface; the assertions below preserve them verbatim.
import { expectAssignable, expectType } from 'tsd';

import { Far, type AtomStyle, type RemotableObject } from '@endo/pass-style';
import type {
  CapData,
  ConvertSlotToVal,
  ConvertValToSlot,
  Encoding,
  EncodingClass,
  EncodingElement,
  EncodingUnion,
  FromCapData,
  FullCompare,
  MakeMarshalOptions,
  Marshal,
  PartialCompare,
  PartialComparison,
  RankCompare,
  RankComparison,
  RankCover,
  ToCapData,
  TreeOf,
} from '../index.js';
import { makeMarshal } from './marshal.js';

// Bidirectional type equality. `expectType<T>(x)` from tsd — and the bare `tsc`
// check this package's CI runs (`yarn lint:types`, no `tsd` CLI) — only asserts
// that the *argument* is assignable to `T`; it is one-directional. A pin like
// `expectType<Expected>(actual)` therefore stays green when `actual` silently
// *drops* a member (the narrower shape is still assignable to `Expected`) and,
// symmetrically, when it *widens* one. `Equal<A, B>` resolves to `true` only when
// `A` and `B` are mutually assignable, so `expectType<true>(null as unknown as
// Equal<Actual, Expected>)` reddens under plain `tsc` whenever the two diverge in
// either direction. Verified by mutation before landing: dropping a member from
// any pinned type below turns its `Equal<...>` to `false`, and `false` is not
// assignable to `true`.
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

// Each public type is pinned by bidirectional equality against an
// independently-written expected shape, so a future edit that drops, widens, or
// malforms a member reddens this suite (a bare `expectType<T>(x as unknown as T)`
// self-assertion cannot — it only checks that the name still exports).

// EncodingClass carries a literal `@qclass` discriminant.
expectType<{ '@qclass': 'NaN' }>(null as unknown as EncodingClass<'NaN'>);

// EncodingUnion carries one entry per '@qclass' tag; pin every member so that
// dropping any one from the union reddens this suite.
expectAssignable<EncodingUnion>({ '@qclass': 'NaN' });
expectAssignable<EncodingUnion>({ '@qclass': 'undefined' });
expectAssignable<EncodingUnion>({ '@qclass': 'Infinity' });
expectAssignable<EncodingUnion>({ '@qclass': '-Infinity' });
expectAssignable<EncodingUnion>({ '@qclass': 'bigint', digits: '123' });
expectAssignable<EncodingUnion>({ '@qclass': '@@asyncIterator' });
expectAssignable<EncodingUnion>({ '@qclass': 'symbol', name: 'foo' });
expectAssignable<EncodingUnion>({
  '@qclass': 'error',
  name: 'Error',
  message: 'boom',
});
// The 'error' arm's optional fields (errorId/cause/errors) are part of the pinned
// surface; exercise them positively so dropping one from the declaration reddens.
expectAssignable<EncodingUnion>({
  '@qclass': 'error',
  name: 'Error',
  message: 'boom',
  errorId: 'e1',
  cause: { '@qclass': 'error', name: 'Error', message: 'inner' },
  errors: [{ '@qclass': 'error', name: 'Error', message: 'aggregated' }],
});
expectAssignable<EncodingUnion>({ '@qclass': 'slot', index: 0, iface: 'x' });
// 'hilbert' is the '@qclass'-collision escape hatch: an `original` Encoding plus
// an optional `rest` record of the value's other properties.
expectAssignable<EncodingUnion>({ '@qclass': 'hilbert', original: 'x' });
expectAssignable<EncodingUnion>({
  '@qclass': 'hilbert',
  original: 'x',
  rest: { a: 'leaf' },
});
expectAssignable<EncodingUnion>({
  '@qclass': 'tagged',
  tag: 't',
  payload: null,
});

// Negative pins: a value whose '@qclass' matches no arm, or that omits an arm's
// required extra field, must NOT be assignable. These redden if the union is
// accidentally widened — e.g. a required member field turned optional, or a
// catch-all arm introduced — which the positive `expectAssignable` pins above
// cannot catch on their own.
// @ts-expect-error - 'bogus' is not one of the union's '@qclass' discriminants
expectAssignable<EncodingUnion>({ '@qclass': 'bogus' });
// @ts-expect-error - the 'slot' arm requires a numeric `index`
expectAssignable<EncodingUnion>({ '@qclass': 'slot' });
// @ts-expect-error - the 'bigint' arm requires `digits`
expectAssignable<EncodingUnion>({ '@qclass': 'bigint' });
// @ts-expect-error - the 'symbol' arm requires `name`
expectAssignable<EncodingUnion>({ '@qclass': 'symbol' });

// Bidirectional pin: `EncodingUnion` must equal exactly this fully-spelled union.
// The positive `expectAssignable` pins above catch a member being *dropped*, and
// the negative `@ts-expect-error` pins catch narrow widenings, but neither reddens
// when a wholly new disjoint arm is *added* to the declaration (a superset stays
// assignable in both the directions those pins probe). `Equal<...>` closes that
// gap: adding, dropping, or reshaping any arm here or in `types.d.ts` diverges the
// two and reddens under plain `tsc`.
expectType<true>(
  null as unknown as Equal<
    EncodingUnion,
    | EncodingClass<'NaN'>
    | EncodingClass<'undefined'>
    | EncodingClass<'Infinity'>
    | EncodingClass<'-Infinity'>
    | (EncodingClass<'bigint'> & { digits: string })
    | EncodingClass<'@@asyncIterator'>
    | (EncodingClass<'symbol'> & { name: string })
    | (EncodingClass<'error'> & {
        name: string;
        message: string;
        errorId?: string;
        cause?: Encoding;
        errors?: Encoding[];
      })
    | (EncodingClass<'slot'> & { index: number; iface?: string })
    | (EncodingClass<'hilbert'> & { original: Encoding; rest?: Encoding })
    | (EncodingClass<'tagged'> & { tag: string; payload: Encoding })
  >,
);

// EncodingElement is a primitive leaf or an EncodingUnion.
expectType<true>(
  null as unknown as Equal<
    EncodingElement,
    boolean | number | null | string | EncodingUnion
  >,
);

// TreeOf<string> is a leaf or a record of subtrees. Pinned bidirectionally with
// `Equal<>`, matching every other exported type in this file: the positive
// `expectAssignable` pins below stay green when the declaration is silently
// widened (e.g. `TreeOf<T>` to `any`, or `T | { [x: PropertyKey]: any }`), so the
// `Equal<...>` pin is what reddens on such a regression on this recursive type.
expectAssignable<TreeOf<string>>('leaf');
expectAssignable<TreeOf<string>>({ a: 'leaf', b: { c: 'leaf' } });
expectType<true>(
  null as unknown as Equal<
    TreeOf<string>,
    string | { [x: PropertyKey]: TreeOf<string> }
  >,
);
// Negative pin: a function value is neither a leaf nor a record of subtrees, so it
// must NOT be assignable. Reddens if `TreeOf` is widened to admit non-tree shapes.
// @ts-expect-error - a function is not a leaf or a record of subtrees
expectAssignable<TreeOf<string>>(() => 'leaf');

// Encoding is the JSON-representable tree of EncodingElements. Pinned
// bidirectionally against its definition so a silent widening of `Encoding`
// itself (independent of `TreeOf`) reddens here rather than shipping undetected.
expectAssignable<Encoding>('leaf');
expectAssignable<Encoding>({ '@qclass': 'NaN' });
expectType<true>(null as unknown as Equal<Encoding, TreeOf<EncodingElement>>);
// Negative pin: a function value is not a valid Encoding tree.
// @ts-expect-error - a function is not assignable to Encoding
expectAssignable<Encoding>(() => 'leaf');

// CapData pins its body/slots shape.
expectType<true>(
  null as unknown as Equal<CapData<string>, { body: string; slots: string[] }>,
);

// Marshal exposes the (de)serialize pair plus the toCapData/fromCapData names.
expectType<true>(
  null as unknown as Equal<
    Marshal<string>,
    {
      serialize: ToCapData<string>;
      unserialize: FromCapData<string>;
      toCapData: ToCapData<string>;
      fromCapData: FromCapData<string>;
    }
  >,
);

// MakeMarshalOptions pins every option's name, optionality, and value set. The
// bidirectional check catches both a dropped option and a sneakily-added one.
expectType<true>(
  null as unknown as Equal<
    MakeMarshalOptions,
    {
      errorTagging?: 'on' | 'off';
      marshalName?: string | undefined;
      errorIdNum?: number | undefined;
      marshalSaveError?: ((err: Error) => void) | undefined;
      serializeBodyFormat?: 'capdata' | 'smallcaps';
    }
  >,
);

// RankComparison is exactly the three-way result.
expectType<true>(null as unknown as Equal<RankComparison, -1 | 0 | 1>);

// RankCover is an inclusive [lower, upper] string pair.
expectType<true>(null as unknown as Equal<RankCover, [string, string]>);

// PartialComparison widens to `number` (TS has no NaN literal type) rather than
// narrowing to the three ordered results.
expectType<true>(null as unknown as Equal<PartialComparison, number>);

// The (de)slot converter signatures are pinned by full-function equality, which
// (unlike a one-directional `expectType` on a callback) is strict on the return
// type and every parameter's arity and optionality: dropping ConvertSlotToVal's
// optional `iface` turns the `Equal` below to `false`.
expectType<true>(
  null as unknown as Equal<
    ConvertValToSlot<string, RemotableObject>,
    (val: RemotableObject) => string
  >,
);
expectType<true>(
  null as unknown as Equal<
    ConvertSlotToVal<string, RemotableObject>,
    (slot: string, iface?: string | undefined) => RemotableObject
  >,
);
// Pin the parameter lists as tuples too, so the arity/optionality guarantee is
// legible on its own: tuple equality reddens if the optional `iface` is dropped.
expectType<true>(
  null as unknown as Equal<
    Parameters<ConvertValToSlot<string, RemotableObject>>,
    [val: RemotableObject]
  >,
);
expectType<true>(
  null as unknown as Equal<
    Parameters<ConvertSlotToVal<string, RemotableObject>>,
    [slot: string, iface?: string | undefined]
  >,
);
// The defaulted generic parameters (`Value ... = any`, `T = any`) resolve to
// `any` when omitted; pin the one-argument instantiations so a regression that
// drops a `= any` default (making the second argument required) reddens here.
expectType<true>(
  null as unknown as Equal<ConvertValToSlot<string>, (val: any) => string>,
);
expectType<true>(
  null as unknown as Equal<
    PartialCompare,
    (left: any, right: any) => PartialComparison
  >,
);

expectType<true>(
  null as unknown as Equal<
    ToCapData<string>,
    (value: import('@endo/pass-style').Passable) => CapData<string>
  >,
);
expectType<true>(
  null as unknown as Equal<FromCapData<string>, (data: CapData<string>) => any>,
);
expectType<true>(
  null as unknown as Equal<
    RankCompare,
    (left: any, right: any) => RankComparison
  >,
);
expectType<true>(null as unknown as Equal<FullCompare, RankCompare>);
expectType<true>(
  null as unknown as Equal<
    PartialCompare<string>,
    (left: string, right: string) => PartialComparison
  >,
);

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
