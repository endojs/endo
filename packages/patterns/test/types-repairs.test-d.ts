/* eslint-disable */
import { expectTypeOf } from 'expect-type';
import type {
  CopyArray,
  CopyRecord,
  CopyTagged,
  Passable,
} from '@endo/pass-style';
import { M } from '../index.js';
import type { CopyBag, CopyMap, CopySet, Key } from '../index.js';
import type {
  TypeFromMethodGuard,
  TypeFromPattern,
} from '../src/type-from-pattern.js';

// Unparameterized collection matchers retain their collection contracts
// instead of degrading to mutable arrays or noisy generic intersections.
{
  const arrayPattern = M.array();
  type ArrayValue = TypeFromPattern<typeof arrayPattern>;
  expectTypeOf(null as unknown as ArrayValue).toEqualTypeOf<CopyArray>();
  expectTypeOf(null as unknown as ArrayValue).not.toExtend<unknown[]>();

  const arrayOfPattern = M.arrayOf();
  type ArrayOfValue = TypeFromPattern<typeof arrayOfPattern>;
  expectTypeOf(null as unknown as ArrayOfValue).toEqualTypeOf<CopyArray>();
}

{
  const recordPattern = M.record();
  type RecordValue = TypeFromPattern<typeof recordPattern>;
  expectTypeOf(null as unknown as RecordValue).toEqualTypeOf<CopyRecord>();
  expectTypeOf(null as unknown as RecordValue).not.toEqualTypeOf<
    Record<string, string>
  >();

  const recordOfPattern = M.recordOf();
  type RecordOfValue = TypeFromPattern<typeof recordOfPattern>;
  expectTypeOf(null as unknown as RecordOfValue).toEqualTypeOf<CopyRecord>();
}

{
  const mapPattern = M.map();
  type MapValue = TypeFromPattern<typeof mapPattern>;
  expectTypeOf(null as unknown as MapValue).toEqualTypeOf<CopyMap>();
  expectTypeOf(null as unknown as MapValue).not.toEqualTypeOf<
    CopyMap<string, string>
  >();

  const mapOfPattern = M.mapOf();
  type MapOfValue = TypeFromPattern<typeof mapOfPattern>;
  expectTypeOf(null as unknown as MapOfValue).toEqualTypeOf<CopyMap>();
}

{
  const setPattern = M.set();
  type SetValue = TypeFromPattern<typeof setPattern>;
  expectTypeOf(null as unknown as SetValue).toEqualTypeOf<CopySet>();
  expectTypeOf(null as unknown as SetValue).not.toEqualTypeOf<
    CopySet<string>
  >();

  const setOfPattern = M.setOf();
  type SetOfValue = TypeFromPattern<typeof setOfPattern>;
  expectTypeOf(null as unknown as SetOfValue).toEqualTypeOf<CopySet>();
}

{
  const bagPattern = M.bag();
  type BagValue = TypeFromPattern<typeof bagPattern>;
  expectTypeOf(null as unknown as BagValue).toEqualTypeOf<CopyBag>();
  expectTypeOf(null as unknown as BagValue).not.toEqualTypeOf<
    CopyBag<bigint>
  >();

  const bagOfPattern = M.bagOf();
  type BagOfValue = TypeFromPattern<typeof bagOfPattern>;
  expectTypeOf(null as unknown as BagOfValue).toEqualTypeOf<CopyBag>();
}

// Parameterized collection patterns preserve the element/key/value types and
// reject a collection with an incompatible element or value type.
{
  const arrayPattern = M.arrayOf(M.string());
  type ArrayValue = TypeFromPattern<typeof arrayPattern>;
  expectTypeOf(null as unknown as ArrayValue).toEqualTypeOf<
    CopyArray<string>
  >();
  expectTypeOf(null as unknown as ArrayValue).not.toExtend<string[]>();
  expectTypeOf(null as unknown as ArrayValue).not.toExtend<number[]>();
}

{
  const recordPattern = M.recordOf(M.string(), M.nat());
  type RecordValue = TypeFromPattern<typeof recordPattern>;
  expectTypeOf(null as unknown as RecordValue).toEqualTypeOf<
    Record<string, bigint>
  >();
  expectTypeOf(null as unknown as RecordValue).not.toExtend<
    Record<string, string>
  >();
}

{
  const mapPattern = M.mapOf(M.string(), M.nat());
  type MapValue = TypeFromPattern<typeof mapPattern>;
  expectTypeOf(null as unknown as MapValue).toEqualTypeOf<
    CopyMap<string, bigint>
  >();
  expectTypeOf(null as unknown as MapValue).not.toExtend<
    CopyMap<number, string>
  >();
}

{
  const setPattern = M.setOf(M.string());
  type SetValue = TypeFromPattern<typeof setPattern>;
  expectTypeOf(null as unknown as SetValue).toEqualTypeOf<CopySet<string>>();
  expectTypeOf(null as unknown as SetValue).not.toExtend<CopySet<number>>();
}

{
  const bagPattern = M.bagOf(M.nat());
  type BagValue = TypeFromPattern<typeof bagPattern>;
  expectTypeOf(null as unknown as BagValue).toEqualTypeOf<CopyBag<bigint>>();
  expectTypeOf(null as unknown as BagValue).not.toExtend<CopyBag<string>>();
}

// Broad key patterns preserve every composite member of Key.
{
  const setPattern = M.setOf(M.any());
  type SetValue = TypeFromPattern<typeof setPattern>;
  expectTypeOf(null as unknown as SetValue).toEqualTypeOf<CopySet<Key>>();
}

{
  const bagPattern = M.bagOf(M.any());
  type BagValue = TypeFromPattern<typeof bagPattern>;
  expectTypeOf(null as unknown as BagValue).toEqualTypeOf<CopyBag<Key>>();
}

{
  const mapPattern = M.mapOf(M.any(), M.string());
  type MapValue = TypeFromPattern<typeof mapPattern>;
  expectTypeOf(null as unknown as MapValue).toEqualTypeOf<
    CopyMap<Key, string>
  >();
}

// Composite values are valid Keys and therefore remain valid members of broad
// key collections.
{
  expectTypeOf(null as unknown as CopyArray<string>).toExtend<Key>();
  expectTypeOf(null as unknown as CopyRecord<string>).toExtend<Key>();
  expectTypeOf(null as unknown as CopySet<string>).toExtend<Key>();
  expectTypeOf(null as unknown as CopyBag<string>).toExtend<Key>();
  expectTypeOf(null as unknown as CopyMap<string, string>).toExtend<Key>();
}

// Tagged defaults model the documented M.string()/M.any() defaults, while
// explicit tag and payload patterns remain precise.
{
  const defaultPattern = M.tagged();
  type DefaultValue = TypeFromPattern<typeof defaultPattern>;
  expectTypeOf(null as unknown as DefaultValue).toEqualTypeOf<
    CopyTagged<string, Passable>
  >();

  const explicitPattern = M.tagged(M.string(), M.nat());
  type ExplicitValue = TypeFromPattern<typeof explicitPattern>;
  expectTypeOf(null as unknown as ExplicitValue).toEqualTypeOf<
    CopyTagged<string, bigint>
  >();
  expectTypeOf(null as unknown as ExplicitValue).not.toExtend<
    CopyTagged<'other', bigint>
  >();
}

// Bare returns are a void contract, including async Promise<void> behavior.
{
  const syncGuard = M.call().returns();
  type SyncMethod = TypeFromMethodGuard<typeof syncGuard>;
  expectTypeOf(null as unknown as SyncMethod).toEqualTypeOf<() => void>();
  expectTypeOf(null as unknown as SyncMethod).not.toEqualTypeOf<
    () => undefined
  >();

  const asyncGuard = M.callWhen().returns();
  type AsyncMethod = TypeFromMethodGuard<typeof asyncGuard>;
  expectTypeOf(null as unknown as AsyncMethod).toEqualTypeOf<
    () => Promise<void>
  >();
  expectTypeOf(null as unknown as AsyncMethod).not.toEqualTypeOf<
    () => Promise<undefined>
  >();

  const explicitUndefinedSyncGuard = M.call().returns(undefined);
  type ExplicitUndefinedSyncMethod = TypeFromMethodGuard<
    typeof explicitUndefinedSyncGuard
  >;
  expectTypeOf(null as unknown as ExplicitUndefinedSyncMethod).toEqualTypeOf<
    () => void
  >();

  const explicitUndefinedAsyncGuard = M.callWhen().returns(undefined);
  type ExplicitUndefinedAsyncMethod = TypeFromMethodGuard<
    typeof explicitUndefinedAsyncGuard
  >;
  expectTypeOf(null as unknown as ExplicitUndefinedAsyncMethod).toEqualTypeOf<
    () => Promise<void>
  >();
}

// An any-typed tag pattern still produces a string tag, rather than
// contaminating the tagged result with any.
{
  const anyTag: any = M.string();
  const pattern = M.tagged(anyTag, M.nat());
  type Value = TypeFromPattern<typeof pattern>;
  expectTypeOf(null as unknown as Value).toEqualTypeOf<
    CopyTagged<string, bigint>
  >();
  expectTypeOf(null as unknown as Value).not.toEqualTypeOf<
    CopyTagged<'other', bigint>
  >();
}
