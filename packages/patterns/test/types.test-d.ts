/* eslint-disable */
import type {
  Passable,
  CopyRecord,
  CopyArray,
  CopyTagged,
  RemotableObject,
} from '@endo/pass-style';
import type { RemotableBrand } from '@endo/eventual-send';
import { expectTypeOf } from 'expect-type';
import { isKey, isScalarKey } from '../src/keys/checkKey.js';
import { M, matches, mustMatch } from '../index.js';
import type {
  Key,
  ScalarKey,
  Pattern,
  Matcher,
  MatcherOf,
  CopySet,
  CopyBag,
  CopyMap,
  CastedPattern,
} from '../index.js';
import type {
  TypeFromPattern,
  TypeFromMethodGuard,
  TypeFromInterfaceGuard,
} from '../src/type-from-pattern.js';

// ===== Existing tests (preserved) =====

// @ts-expect-error M.any missing parens
M.arrayOf(M.any);
M.arrayOf(M.any());

const passable: Passable = null as any;
{
  const result = isKey(passable);
  expectTypeOf(result).toEqualTypeOf<boolean>();
  if (result) {
    expectTypeOf(passable).toEqualTypeOf<Key>();
  } else {
    expectTypeOf(passable).not.toEqualTypeOf<Key>();
  }
}
{
  const str = 'some string';
  if (isKey(str)) {
    // doesn't widen
    expectTypeOf<typeof str>().toEqualTypeOf<string>();
  }
}

{
  const someAny: any = null;
  someAny.foo;
  if (isKey(someAny)) {
    // still any
    someAny.foo;
  }
}

{
  const result = isScalarKey(passable);
  expectTypeOf(result).toEqualTypeOf<boolean>();
  if (result) {
    expectTypeOf(passable).toEqualTypeOf<ScalarKey>();
  } else {
    expectTypeOf(passable).not.toEqualTypeOf<ScalarKey>();
  }
}

// ===== MatcherOf backward compatibility =====

// MatcherOf extends Matcher
{
  const m: MatcherOf<'string', string> = null as any;
  expectTypeOf(m).toExtend<Matcher>();
  expectTypeOf(m).toExtend<Pattern>();
}

// ===== 1. Every primitive matcher → correct type =====

// M.string() → string
{
  const p = M.string();
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<string>();
}

// M.number() → number
{
  const p = M.number();
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<number>();
}

// M.boolean() → boolean
{
  const p = M.boolean();
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<boolean>();
}

// M.bigint() → bigint
{
  const p = M.bigint();
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<bigint>();
}

// M.nat() → bigint
{
  const p = M.nat();
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<bigint>();
}

// M.symbol() → symbol
{
  const p = M.symbol();
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<symbol>();
}

// M.undefined() → void
// Uses `void` rather than `undefined` so that impls declared with a
// `void` return can satisfy guards ending in `.returns(M.undefined())`.
// See the TFKindMap['undefined'] comment in type-from-pattern.ts.
{
  const p = M.undefined();
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<void>();
}

// M.null() → null (literal pattern, not a matcher)
{
  const p = M.null();
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<null>();
}

// M.error() → Error
{
  const p = M.error();
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<Error>();
}

// M.promise() → PromiseLike<any>
// Uses PromiseLike (not Promise) because at runtime `M.promise()` checks
// `passStyleOf === 'promise'` which is duck-typed for any thenable.
{
  const p = M.promise();
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<PromiseLike<any>>();
}

// M.any() → Passable
{
  const p = M.any();
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<Passable>();
}

// M.remotable() → any (compatible with any concrete remotable interface)
// See TFRemotable in type-from-pattern.ts: when unparameterized, the
// inferred type is `any` so it's assignable to any concrete remotable
// typedef. Without this, downstream consumers like Agoric SDK's
// chainStorage StorageNode would need explicit casts at every use site.
{
  const p = M.remotable();
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<any>();
}

// M.remotable('label') used in M.call() → method param is `any`, not `unknown`.
// Regression: previously, the unparameterized M.remotable() default was
// `RemotableObject | RemotableBrand<any, any>`, which propagated as `unknown`
// when intersected through method-guard inference.
{
  const SeatShape = M.remotable('Seat');
  const guard = M.call(SeatShape).returns(M.any());
  type Fn = TypeFromMethodGuard<typeof guard>;
  // The first parameter should be `any`, not `unknown`
  type Param0 = Parameters<Fn>[0];
  expectTypeOf(null as unknown as Param0).toEqualTypeOf<any>();
}

// Same regression: stored as a const, used via typeof
{
  const VoterHandle = M.remotable();
  const guard = M.call(VoterHandle).returns(M.any());
  type Fn = TypeFromMethodGuard<typeof guard>;
  type Param0 = Parameters<Fn>[0];
  expectTypeOf(null as unknown as Param0).toEqualTypeOf<any>();
}

// `.rest(M.arrayOf(X))` → rest type is `X[]`, not `X[][]`.
// Regression: TFRestArgs always wrapped its result with `[]`, which
// double-wrapped array patterns. `.rest(P)` matches the rest portion
// of the args array (as a single array) against P, so when P already
// infers to an array type, the rest type IS that array.
{
  const PathShape = M.arrayOf(M.string());
  const guard = M.call().rest(PathShape).returns(M.any());
  type Fn = TypeFromMethodGuard<typeof guard>;
  // (...args: string[]) — not (...args: string[][])
  expectTypeOf(null as unknown as Fn).toEqualTypeOf<
    (...args: string[]) => any
  >();
}

// Non-array rest pattern still wraps: `.rest(M.string())` → `string[]`
{
  const guard = M.call().rest(M.string()).returns(M.any());
  type Fn = TypeFromMethodGuard<typeof guard>;
  expectTypeOf(null as unknown as Fn).toEqualTypeOf<
    (...args: string[]) => any
  >();
}

// =============================================================================
// CastedPattern
// =============================================================================
// CastedPattern<T> is an unchecked static type assertion. The runtime
// pattern still validates the structural shape; the T parameter is a
// developer claim that may be narrower (or broader) than the structural
// inference would yield.

// Setting the cast: TypeFromPattern returns the asserted type
{
  type Branded = `agoric1${string}`;
  type Casted = CastedPattern<Branded>;
  expectTypeOf(
    null as unknown as TypeFromPattern<Casted>,
  ).toEqualTypeOf<Branded>();
}

// Discriminated union case (the motivating example): a structural record
// pattern's natural inference is the cross-product, but a CastedPattern
// can claim the discriminated-union form.
{
  type Coin =
    | { kind: 'gold'; weight: number }
    | { kind: 'silver'; purity: number };
  type CoinShape = CastedPattern<Coin>;
  type Inferred = TypeFromPattern<CoinShape>;
  expectTypeOf(null as unknown as Inferred).toEqualTypeOf<Coin>();
}

// CastedPattern is structurally a Pattern — accepts existing pattern values
// without laundering through `unknown`.  The phantom property is optional,
// so any Pattern value satisfies CastedPattern<T> structurally.
{
  const innerShape = M.string();
  const casted: CastedPattern<'agoric1xyz'> = innerShape;
  type T = TypeFromPattern<typeof casted>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<'agoric1xyz'>();
}

// Patterns WITHOUT the phantom fall through to structural inference
// (the unset phantom resolves to `unknown`, which the conditional skips).
// This verifies the unset case doesn't accidentally hijack normal patterns.
{
  const stringP = M.string();
  type T = TypeFromPattern<typeof stringP>;
  // Should be the leaf-table result for 'string', not `unknown`
  expectTypeOf(null as unknown as T).toExtend<string>();
}

// M.byteArray() → ArrayBuffer (via kind)
{
  const p = M.byteArray();
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<ArrayBuffer>();
}

// M.record() → CopyRecord
{
  const p = M.record();
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<CopyRecord>();
}

// M.array() → CopyArray
{
  const p = M.array();
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<CopyArray>();
}

// ===== 2. Literal patterns → preserve literal types =====

expectTypeOf(
  null as unknown as TypeFromPattern<'hello'>,
).toEqualTypeOf<'hello'>();
expectTypeOf(null as unknown as TypeFromPattern<42>).toEqualTypeOf<42>();
expectTypeOf(null as unknown as TypeFromPattern<true>).toEqualTypeOf<true>();
expectTypeOf(null as unknown as TypeFromPattern<null>).toEqualTypeOf<null>();

// ===== 3. Structural record/tuple patterns =====

// Record pattern
{
  const p = { name: M.string(), age: M.nat() };
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<{
    name: string;
    age: bigint;
  }>();
}

// Tuple pattern (as const for tuple inference)
{
  const p = [M.string(), M.nat()] as const;
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<[string, bigint]>();
}

// ===== 4. Combinators: or → union, and → intersection, opt, eref =====

// M.or() preserves literal arguments as a literal union.
{
  const p = M.or('start', 'continue', 'abort');
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<
    'start' | 'continue' | 'abort'
  >();
}

// M.or() also preserves literal discriminants in record patterns.
{
  const p = M.or({ mode: 'start' }, { mode: 'continue' });
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<
    { mode: 'start' } | { mode: 'continue' }
  >();
}

// M.or() → union
{
  const p = M.or(M.string(), M.nat());
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<string | bigint>();
}

// M.and() → intersection (mostly useful with record patterns)
{
  const p = M.and(M.string(), M.nat());
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<string & bigint>();
}

// M.and() preserves literal fields in intersected record patterns.
{
  const p = M.and({ mode: 'start' }, { payload: M.string() });
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<
    { mode: 'start' } & { payload: string }
  >();
}

// M.opt() → T | void (void rather than undefined; see TFKindMap comment)
{
  const p = M.opt(M.string());
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<string | void>();
}

// M.eref() → T | PromiseLike<any>
{
  const p = M.eref(M.string());
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<string | PromiseLike<any>>();
}

// ===== 5. Containers: arrayOf, recordOf, mapOf =====

// M.arrayOf(M.string()) → string[]
{
  const p = M.arrayOf(M.string());
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<string[]>();
}

// M.recordOf(M.string(), M.nat()) → Record<string, bigint>
{
  const p = M.recordOf(M.string(), M.nat());
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<Record<string, bigint>>();
}

// M.mapOf(M.string(), M.nat()) → CopyMap
{
  const p = M.mapOf(M.string(), M.nat());
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toExtend<CopyMap>();
}

// ===== 6. splitRecord: required only, required + optional =====

// Required only
{
  const p = M.splitRecord({ name: M.string(), age: M.nat() });
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<{
    name: string;
    age: bigint;
  }>();
}

// Required + optional
{
  const p = M.splitRecord(
    { name: M.string() },
    { age: M.nat(), email: M.string() },
  );
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<{
    name: string;
    age?: bigint | undefined;
    email?: string | undefined;
  }>();
}

// Literal required and optional fields remain narrow.
{
  const p = M.splitRecord(
    { mode: M.or('start', 'continue') },
    { phase: 'ready' },
  );
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<{
    mode: 'start' | 'continue';
    phase?: 'ready' | undefined;
  }>();
}

// ===== 7. splitArray: required only, required + optional =====

// Required only
{
  const p = M.splitArray([M.string(), M.nat()]);
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<[string, bigint]>();
}

// Required + optional: produces truly optional tuple elements `[X?, Y?]`
// (not just `T | undefined`).  The optional positions in `splitArray`'s
// second argument become positions you can omit from the call site,
// matching consumer typedefs like `TransferPart = [a?, b?, c?, d?]`.
{
  const p = M.splitArray([M.string()], [M.nat(), M.boolean()]);
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<
    [string, bigint?, boolean?]
  >();
}

// Literal elements remain narrow while preserving the tuple shape.
{
  const p = M.splitArray([{ mode: 'start' }, { mode: 'continue' }], ['done']);
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<
    [{ mode: 'start' }, { mode: 'continue' }, 'done'?]
  >();
}

// Literal rest patterns remain narrow as well.
{
  const p = M.splitArray([], [], { mode: 'rest' });
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<{ mode: 'rest' }[]>();
}

{
  const p = M.splitRecord({}, {}, { mode: 'rest' });
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<{
    [key: string]: { mode: 'rest' };
  }>();
}

// ===== 8. Hint parameters (type narrowing) =====

// M.string<`${bigint}`>() → `${bigint}`
{
  const p = M.string<`${bigint}`>();
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<`${bigint}`>();
}

// M.number<1 | 2 | 3>() → 1 | 2 | 3
{
  const p = M.number<1 | 2 | 3>();
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<1 | 2 | 3>();
}

// M.remotable<Brand>() with a branded type
{
  type Brand = RemotableBrand<{}, { getBrand: () => string }>;
  const p = M.remotable<Brand>('Brand');
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<Brand>();
}

// M.promise<Payment>() → PromiseLike<Payment>
{
  type Payment = RemotableObject;
  const p = M.promise<Payment>();
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<PromiseLike<Payment>>();
}

// ===== M.infer ergonomics (like z.infer) =====

{
  const PersonShape = M.splitRecord({
    name: M.string(),
    age: M.nat(),
  });
  type Person = M.infer<typeof PersonShape>;
  expectTypeOf(null as unknown as Person).toEqualTypeOf<{
    name: string;
    age: bigint;
  }>();
}

// ===== Nested / complex patterns =====

// Nested splitRecord
{
  const AddressShape = M.splitRecord({
    street: M.string(),
    city: M.string(),
  });
  const PersonShape = M.splitRecord({
    name: M.string(),
    address: AddressShape,
  });
  type T = TypeFromPattern<typeof PersonShape>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<{
    name: string;
    address: { street: string; city: string };
  }>();
}

// Array of records
{
  const p = M.arrayOf(M.splitRecord({ name: M.string(), value: M.nat() }));
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<
    { name: string; value: bigint }[]
  >();
}

// M.or with different matcher types
{
  const p = M.or(M.string(), M.nat(), M.boolean());
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<string | bigint | boolean>();
}

// M.scalar() → ScalarKey
{
  const p = M.scalar();
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<ScalarKey>();
}

// M.key() → Key
{
  const p = M.key();
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<Key>();
}

// M.pattern() → Pattern
{
  const p = M.pattern();
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<Pattern>();
}

// ===== 9. M.call(...).returns(...) → MethodGuard → TypeFromMethodGuard =====

// Sync method: (string, bigint) => boolean
{
  const mg = M.call(M.string(), M.nat()).returns(M.boolean());
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectTypeOf(null as unknown as Fn).toEqualTypeOf<
    (arg0: string, arg1: bigint) => boolean
  >();
}

// Sync method with no args: () => number
{
  const mg = M.call().returns(M.number());
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectTypeOf(null as unknown as Fn).toEqualTypeOf<() => number>();
}

// Sync method with optional args: (string, number | undefined) => Passable
{
  const mg = M.call(M.string()).optional(M.number()).returns();
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectTypeOf(null as unknown as Fn).toEqualTypeOf<
    (arg0: string, arg1: number | undefined) => Passable
  >();
}

// Async method via callWhen: (...) => Promise<string>
{
  const mg = M.callWhen(M.nat()).returns(M.string());
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectTypeOf(null as unknown as Fn).toEqualTypeOf<
    (arg0: bigint) => Promise<string>
  >();
}

// Async method with M.await: M.await(M.nat()) should infer bigint arg
{
  const mg = M.callWhen(M.await(M.nat())).returns(M.string());
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectTypeOf(null as unknown as Fn).toEqualTypeOf<
    (arg0: bigint) => Promise<string>
  >();
}

// M.raw() args → any
{
  const mg = M.call(M.raw()).returns(M.raw());
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectTypeOf(null as unknown as Fn).toEqualTypeOf<(arg0: any) => any>();
}

// ===== 10. M.interface → InterfaceGuard → TypeFromInterfaceGuard =====

// Single-method interface
{
  const FooI = M.interface('Foo', {
    bar: M.call(M.string()).returns(M.nat()),
  });
  type Methods = TypeFromInterfaceGuard<typeof FooI>;
  expectTypeOf(null as unknown as Methods).toEqualTypeOf<{
    bar: (arg0: string) => bigint;
  }>();
}

// A nested interface method guard keeps literal discriminants narrow.
{
  type Operation = { mode: 'start' } | { mode: 'continue' | 'abort' | 'skip' };
  const OperationShape = M.or(
    M.splitRecord({ mode: 'start' }),
    M.splitRecord({ mode: M.or('continue', 'abort', 'skip') }),
  );
  expectTypeOf(
    null as unknown as TypeFromPattern<typeof OperationShape>,
  ).toEqualTypeOf<Operation>();

  const ControllerI = M.interface('Controller', {
    handle: M.call(OperationShape).returns(M.boolean()),
  });
  type ControllerMethods = TypeFromInterfaceGuard<typeof ControllerI>;
  expectTypeOf(null as unknown as ControllerMethods).toEqualTypeOf<{
    handle: (arg0: Operation) => boolean;
  }>();

  const methods: ControllerMethods = {
    handle(operation) {
      expectTypeOf(operation).toEqualTypeOf<Operation>();
      return operation.mode === 'start';
    },
  };
  // eslint-disable-next-line no-void
  void methods;
}

// Multi-method interface
{
  const CounterI = M.interface('Counter', {
    incr: M.call().optional(M.number()).returns(M.number()),
    decr: M.call(M.number()).returns(M.number()),
    getValue: M.call().returns(M.number()),
  });
  type Methods = TypeFromInterfaceGuard<typeof CounterI>;
  expectTypeOf(null as unknown as Methods).toEqualTypeOf<{
    incr: (arg0: number | undefined) => number;
    decr: (arg0: number) => number;
    getValue: () => number;
  }>();
}

// Interface with async methods
{
  const AsyncServiceI = M.interface('AsyncService', {
    fetch: M.callWhen(M.string()).returns(M.string()),
    getAll: M.call().returns(M.arrayOf(M.string())),
  });
  type Methods = TypeFromInterfaceGuard<typeof AsyncServiceI>;
  expectTypeOf(null as unknown as Methods).toEqualTypeOf<{
    fetch: (arg0: string) => Promise<string>;
    getAll: () => string[];
  }>();
}

// ===== 11. Exo-style pattern: InterfaceGuard constraining method impls =====

// Demonstrate that TypeFromInterfaceGuard produces types
// suitable for constraining Exo method implementations.
{
  type Brand = RemotableBrand<{}, { getAllegedName: () => string }>;
  type Issuer = RemotableBrand<{}, { getAmountOf: (payment: any) => any }>;

  const IssuerRecordShape = M.splitRecord({
    brand: M.remotable<Brand>('Brand'),
    issuer: M.remotable<Issuer>('Issuer'),
  });
  type IssuerRecord = TypeFromPattern<typeof IssuerRecordShape>;
  expectTypeOf(null as unknown as IssuerRecord).toEqualTypeOf<{
    brand: Brand;
    issuer: Issuer;
  }>();

  // Full Exo pattern: define interface, infer methods type, use for impl
  const ExchangeI = M.interface('Exchange', {
    getIssuer: M.call().returns(M.remotable<Issuer>('Issuer')),
    swap: M.call(M.remotable<Brand>('Brand'), M.nat()).returns(M.nat()),
    swapAsync: M.callWhen(M.await(M.remotable<Brand>('Brand'))).returns(
      M.nat(),
    ),
  });
  type ExchangeMethods = TypeFromInterfaceGuard<typeof ExchangeI>;

  // Verify each method signature inferred from the guard
  expectTypeOf(null as unknown as ExchangeMethods).toEqualTypeOf<{
    getIssuer: () => Issuer;
    swap: (arg0: Brand, arg1: bigint) => bigint;
    swapAsync: (arg0: Brand) => Promise<bigint>;
  }>();

  // Show that a methods object satisfies the inferred type
  const methods: ExchangeMethods = {
    getIssuer() {
      return null as unknown as Issuer;
    },
    swap(_brand, amount) {
      // _brand is inferred as Brand, amount as bigint
      expectTypeOf(_brand).toEqualTypeOf<Brand>();
      expectTypeOf(amount).toEqualTypeOf<bigint>();
      return amount;
    },
    swapAsync(_brand) {
      expectTypeOf(_brand).toEqualTypeOf<Brand>();
      return Promise.resolve(0n);
    },
  };

  void methods;
}

// ===== 12. Complex guard combinations =====

// M.or inside splitRecord
{
  const shape = M.splitRecord({
    value: M.or(M.string(), M.nat()),
    label: M.string(),
  });
  type T = TypeFromPattern<typeof shape>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<{
    value: string | bigint;
    label: string;
  }>();
}

// M.opt in method guard position (via M.or desugaring)
{
  const mg = M.call(M.opt(M.string())).returns(M.boolean());
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectTypeOf(null as unknown as Fn).toEqualTypeOf<
    (arg0: string | undefined) => boolean
  >();
}

// M.eref in method guard position
{
  const mg = M.call(M.eref(M.nat())).returns(M.string());
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectTypeOf(null as unknown as Fn).toEqualTypeOf<
    (arg0: bigint | Promise<any>) => string
  >();
}

// Nested arrayOf inside splitRecord
{
  const shape = M.splitRecord({
    items: M.arrayOf(M.splitRecord({ id: M.nat(), name: M.string() })),
    count: M.nat(),
  });
  type T = TypeFromPattern<typeof shape>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<{
    items: { id: bigint; name: string }[];
    count: bigint;
  }>();
}

// ===== M.interface backward compat: unparameterized MethodGuard =====
{
  // Verify that using MethodGuard without type params still works
  type MG = import('../index.js').MethodGuard;
  const mg: MG = null as any;
  expectTypeOf(mg).toExtend<MG>();
  // The broad MethodGuard is assignable from a specific one
  const specific = M.call(M.string()).returns(M.nat());
  expectTypeOf(specific).toExtend<MG>();
}

// ===== Matchers that return unbranded Matcher (no TypeFromPattern inference) =====

// M.not() → Passable (negation can't narrow)
{
  const p = M.not(M.string());
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<Passable>();
}

// M.kind('boolean') → boolean (explicit kind call)
{
  const p = M.kind('boolean');
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<boolean>();
}

// M.kind('copyRecord') → CopyRecord
{
  const p = M.kind('copyRecord');
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<CopyRecord>();
}

// M.set() → CopySet (via kind)
{
  const p = M.set();
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<CopySet>();
}

// M.bag() → CopyBag (via kind)
{
  const p = M.bag();
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<CopyBag>();
}

// M.map() → CopyMap (via kind)
{
  const p = M.map();
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<CopyMap>();
}

// ===== Edge cases =====

// Empty splitRecord → {}
{
  const p = M.splitRecord({});
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<{}>();
}

// Empty splitArray → []
{
  const p = M.splitArray([]);
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<[]>();
}

// Deeply nested (3+ levels) to stress-test instantiation depth
{
  const p = M.splitRecord({
    a: M.splitRecord({
      b: M.splitRecord({
        c: M.splitRecord({
          d: M.string(),
        }),
      }),
    }),
  });
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<{
    a: { b: { c: { d: string } } };
  }>();
}

// M.or with many branches
{
  const p = M.or(M.string(), M.nat(), M.boolean(), M.remotable());
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<
    string | bigint | boolean | RemotableObject | RemotableBrand<any, any>
  >();
}

// recordOf with no args defaults to Record<string, any>
// TS limitation: TypeFromPattern defaults to Record<string, any> because
// the default Pattern type parameter erases to the Passable union, which
// doesn't simplify further.
{
  const p = M.recordOf();
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toExtend<Record<string, any>>();
}

// ===== Comparison matchers → Key =====

{
  const p = M.lt(42);
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<Key>();
}
{
  const p = M.lte('foo');
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<Key>();
}
{
  const p = M.eq(100n);
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<Key>();
}
{
  const p = M.neq(true);
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<Key>();
}
{
  const p = M.gte(0);
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<Key>();
}
{
  const p = M.gt(-1);
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<Key>();
}

// ===== setOf / bagOf / tagged / containerHas =====

// setOf with element pattern
{
  const p = M.setOf(M.string());
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<CopySet<string>>();
}

// bagOf with element pattern
{
  const p = M.bagOf(M.nat());
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<CopyBag<bigint>>();
}

// tagged with tag pattern
{
  const p = M.tagged(M.string());
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<
    CopyTagged<string, Passable>
  >();
}

// containerHas → Passable
{
  const p = M.containerHas(M.string());
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<Passable>();
}

// ===== M.eref and M.opt =====

// eref infers T | PromiseLike<any>
{
  const p = M.eref(M.string());
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<string | PromiseLike<any>>();
}

// opt infers T | void
{
  const p = M.opt(M.nat());
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<bigint | void>();
}

// ===== matches type guard (narrows in if-blocks) =====

{
  const value: unknown = null as any;
  if (matches(value, M.string())) {
    expectTypeOf(value).toEqualTypeOf<string>();
  }
}

{
  const value: unknown = null as any;
  if (matches(value, M.splitRecord({ name: M.string(), age: M.nat() }))) {
    expectTypeOf(value).toEqualTypeOf<{ name: string; age: bigint }>();
  }
}

{
  const value: unknown = null as any;
  if (matches(value, M.or(M.string(), M.nat()))) {
    expectTypeOf(value).toEqualTypeOf<string | bigint>();
  }
}

// ===== mustMatch assertion (narrows after call) =====
// TS limitation: `asserts x is T` only works when the function has an
// explicit type annotation at its declaration site.  mustMatch is
// re-exported through types-index.d.ts to provide the annotation that
// the destructured PatternKit member lacks.  If TS relaxes the
// explicit-annotation requirement for assertion functions, the
// re-export indirection could be removed.

{
  const value: unknown = null as any;
  mustMatch(value, M.string());
  expectTypeOf(value).toEqualTypeOf<string>();
}

{
  const value: unknown = null as any;
  mustMatch(value, M.splitRecord({ x: M.nat(), y: M.nat() }));
  expectTypeOf(value).toEqualTypeOf<{ x: bigint; y: bigint }>();
}

// ===== M.remotable with InterfaceGuard type parameter =====

// Default M.remotable() → `any` (matching M.promise() default).
// See the test near the top of the file for the rationale; this duplicate
// site is preserved as a regression boundary.
{
  const p = M.remotable();
  type T = TypeFromPattern<typeof p>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<any>();
}

// M.remotable<typeof Guard>() → facet-isolated remotable type
{
  const PublicI = M.interface('Public', {
    getData: M.call().returns(M.string()),
    getCount: M.call().returns(M.nat()),
  });
  const p = M.remotable<typeof PublicI>('Public');
  type T = TypeFromPattern<typeof p>;
  // Should resolve to the interface's methods + remotable branding
  expectTypeOf(null as unknown as T).toExtend<{
    getData: () => string;
    getCount: () => bigint;
  }>();
  expectTypeOf(null as unknown as T).toExtend<RemotableObject>();
}

// Kit guard: admin facet returns the public facet with type isolation
{
  const PublicI = M.interface('Public', {
    getData: M.call().returns(M.string()),
  });
  const AdminI = M.interface('Admin', {
    getPublic: M.call().returns(M.remotable<typeof PublicI>('Public')),
  });
  type AdminMethods = TypeFromInterfaceGuard<typeof AdminI>;
  // getPublic returns a remotable with getData method, not a generic RemotableObject
  type PublicFacet = ReturnType<AdminMethods['getPublic']>;
  expectTypeOf(null as unknown as PublicFacet).toExtend<{
    getData: () => string;
  }>();
  expectTypeOf(null as unknown as PublicFacet).toExtend<RemotableObject>();
}

// TypeFromMethodGuard resolves remotable return guard
{
  const FooI = M.interface('Foo', {
    bar: M.call().returns(M.string()),
  });
  const mg = M.call().returns(M.remotable<typeof FooI>('Foo'));
  type Fn = TypeFromMethodGuard<typeof mg>;
  type Ret = ReturnType<Fn>;
  expectTypeOf(null as unknown as Ret).toExtend<{ bar: () => string }>();
  expectTypeOf(null as unknown as Ret).toExtend<RemotableObject>();
}

// ===== M.interface with sloppy/defaultGuards options =====

// M.interface with no options → typed InterfaceGuard
{
  const FooI = M.interface('Foo', {
    bar: M.call(M.string()).returns(M.nat()),
  });
  type Methods = TypeFromInterfaceGuard<typeof FooI>;
  expectTypeOf(null as unknown as Methods).toEqualTypeOf<{
    bar: (arg0: string) => bigint;
  }>();
}

// M.interface with explicit strict options → typed InterfaceGuard
{
  const FooI = M.interface(
    'Foo',
    { bar: M.call(M.string()).returns(M.nat()) },
    { defaultGuards: undefined },
  );
  type Methods = TypeFromInterfaceGuard<typeof FooI>;
  expectTypeOf(null as unknown as Methods).toEqualTypeOf<{
    bar: (arg0: string) => bigint;
  }>();
}

// M.interface with defaultGuards: 'passable' → InterfaceGuard<any>
// (sloppy mode: method guards become any, so methods are unconstrained)
{
  const FooI = M.interface(
    'Foo',
    { bar: M.call(M.string()).returns(M.nat()) },
    { defaultGuards: 'passable' },
  );
  type Methods = TypeFromInterfaceGuard<typeof FooI>;
  // With sloppy/defaultGuards, the guard is InterfaceGuard<any>,
  // so TypeFromInterfaceGuard produces the broad fallback type
  expectTypeOf(null as unknown as Methods).toExtend<
    Record<string, (...args: any[]) => any>
  >();
}

// ===== M.infer (via namespace import) =====
{
  const shape = M.splitRecord({ x: M.nat() });
  type T = M.infer<typeof shape>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<{ x: bigint }>();
}

{
  // M.infer with complex nested pattern
  const shape = M.splitRecord({
    name: M.string(),
    scores: M.arrayOf(M.number()),
    metadata: M.splitRecord({ version: M.nat() }, { description: M.string() }),
  });
  type T = M.infer<typeof shape>;
  expectTypeOf(null as unknown as T).toEqualTypeOf<{
    name: string;
    scores: number[];
    metadata: {
      version: bigint;
      description?: string | undefined;
    };
  }>();
}

// ===== Real-world interface: ChainStorageNode-like pattern =====
// Tests a complex M.interface with callWhen, splitRecord with optional fields,
// bare .returns(), and M.remotable self-reference.
{
  const ChainStorageNodeI = M.interface('StorageNode', {
    setValue: M.callWhen(M.string()).returns(),
    getPath: M.call().returns(M.string()),
    getStoreKey: M.callWhen().returns(
      M.splitRecord(
        {
          storeName: M.string(),
          storeSubkey: M.string(),
          dataPrefixBytes: M.string(),
        },
        { noDataValue: M.string() },
      ),
    ),
    makeChildNode: M.call(M.string())
      .optional(M.splitRecord({}, { sequence: M.boolean() }, {}))
      .returns(M.remotable('StorageNode')),
  });

  type Methods = TypeFromInterfaceGuard<typeof ChainStorageNodeI>;

  // setValue: async method, bare .returns() defaults to MatcherOf<'kind', 'undefined'>
  // so the return type is Promise<undefined> — NOT void, NOT null
  expectTypeOf(
    null as unknown as ReturnType<Methods['setValue']>,
  ).toEqualTypeOf<Promise<undefined>>();

  // getPath: sync, returns string
  expectTypeOf(
    null as unknown as ReturnType<Methods['getPath']>,
  ).toEqualTypeOf<string>();

  // getStoreKey: async, returns splitRecord with required + optional fields
  expectTypeOf(
    null as unknown as ReturnType<Methods['getStoreKey']>,
  ).toEqualTypeOf<
    Promise<{
      storeName: string;
      storeSubkey: string;
      dataPrefixBytes: string;
      noDataValue?: string | undefined;
    }>
  >();

  // makeChildNode: sync, returns broad remotable. Unparameterized
  // M.remotable() resolves to `any` (matching M.promise() default)
  // so the inferred return is compatible with any concrete remotable
  // typedef.
  expectTypeOf(
    null as unknown as ReturnType<Methods['makeChildNode']>,
  ).toEqualTypeOf<any>();

  // makeChildNode: first arg is string
  expectTypeOf(null as unknown as Methods['makeChildNode']).toExtend<
    (name: string, ...rest: any[]) => any
  >();
}

// ===== Bare .returns() defaults to void (from MatcherOf<'kind','undefined'>) =====
// We use `void` rather than `undefined` so that impls declared with
// `method(): void` satisfy guards ending in bare `.returns()` or
// `.returns(M.undefined())`.  TypeScript rejects
// `() => void` assignment to `() => undefined` because a void-returning
// function may return any value (callers ignore it), while an
// undefined-returning function must literally return `undefined`.
// At runtime the guard only checks the value *is* `undefined`, which
// both void- and undefined-returning impls satisfy in practice.
{
  // Sync
  const mg1 = M.call().returns();
  type Fn1 = TypeFromMethodGuard<typeof mg1>;
  expectTypeOf(null as unknown as ReturnType<Fn1>).toEqualTypeOf<void>();

  // Async (callWhen)
  const mg2 = M.callWhen().returns();
  type Fn2 = TypeFromMethodGuard<typeof mg2>;
  expectTypeOf(null as unknown as ReturnType<Fn2>).toEqualTypeOf<
    Promise<void>
  >();
}
