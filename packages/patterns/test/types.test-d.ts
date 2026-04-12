import type {
  Passable,
  CopyRecord,
  CopyArray,
  CopyTagged,
  RemotableObject,
} from '@endo/pass-style';
import type { RemotableBrand } from '@endo/eventual-send';
import { expectNotType, expectType, expectAssignable } from 'tsd';
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
  expectType<boolean>(result);
  if (result) {
    expectType<Key>(passable);
  } else {
    expectNotType<Key>(passable);
  }
}
{
  const str = 'some string';
  if (isKey(str)) {
    // doesn't widen
    expectType<string>(str);
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
  expectType<boolean>(result);
  if (result) {
    expectType<ScalarKey>(passable);
  } else {
    expectNotType<ScalarKey>(passable);
  }
}

// ===== MatcherOf backward compatibility =====

// MatcherOf extends Matcher
{
  const m: MatcherOf<'string', string> = null as any;
  expectAssignable<Matcher>(m);
  expectAssignable<Pattern>(m);
}

// ===== 1. Every primitive matcher → correct type =====

// M.string() → string
{
  const p = M.string();
  type T = TypeFromPattern<typeof p>;
  expectType<string>(null as unknown as T);
}

// M.number() → number
{
  const p = M.number();
  type T = TypeFromPattern<typeof p>;
  expectType<number>(null as unknown as T);
}

// M.boolean() → boolean
{
  const p = M.boolean();
  type T = TypeFromPattern<typeof p>;
  expectType<boolean>(null as unknown as T);
}

// M.bigint() → bigint
{
  const p = M.bigint();
  type T = TypeFromPattern<typeof p>;
  expectType<bigint>(null as unknown as T);
}

// M.nat() → bigint
{
  const p = M.nat();
  type T = TypeFromPattern<typeof p>;
  expectType<bigint>(null as unknown as T);
}

// M.symbol() → symbol
{
  const p = M.symbol();
  type T = TypeFromPattern<typeof p>;
  expectType<symbol>(null as unknown as T);
}

// M.undefined() → undefined
{
  const p = M.undefined();
  type T = TypeFromPattern<typeof p>;
  expectType<undefined>(null as unknown as T);
}

// M.null() → null (literal pattern, not a matcher)
{
  const p = M.null();
  type T = TypeFromPattern<typeof p>;
  expectType<null>(null as unknown as T);
}

// M.error() → Error
{
  const p = M.error();
  type T = TypeFromPattern<typeof p>;
  expectType<Error>(null as unknown as T);
}

// M.promise() → Promise<any>
{
  const p = M.promise();
  type T = TypeFromPattern<typeof p>;
  expectType<Promise<any>>(null as unknown as T);
}

// M.any() → Passable
{
  const p = M.any();
  type T = TypeFromPattern<typeof p>;
  expectType<Passable>(null as unknown as T);
}

// M.remotable() → RemotableObject | RemotableBrand<any, any>
{
  const p = M.remotable();
  type T = TypeFromPattern<typeof p>;
  expectType<RemotableObject | RemotableBrand<any, any>>(null as unknown as T);
}

// M.byteArray() → ArrayBuffer (via kind)
{
  const p = M.byteArray();
  type T = TypeFromPattern<typeof p>;
  expectType<ArrayBuffer>(null as unknown as T);
}

// M.record() → CopyRecord
{
  const p = M.record();
  type T = TypeFromPattern<typeof p>;
  expectType<CopyRecord>(null as unknown as T);
}

// M.array() → CopyArray
{
  const p = M.array();
  type T = TypeFromPattern<typeof p>;
  expectType<CopyArray>(null as unknown as T);
}

// ===== 2. Literal patterns → preserve literal types =====

expectType<'hello'>(null as unknown as TypeFromPattern<'hello'>);
expectType<42>(null as unknown as TypeFromPattern<42>);
expectType<true>(null as unknown as TypeFromPattern<true>);
expectType<null>(null as unknown as TypeFromPattern<null>);

// ===== 3. Structural record/tuple patterns =====

// Record pattern
{
  const p = { name: M.string(), age: M.nat() };
  type T = TypeFromPattern<typeof p>;
  expectType<{ name: string; age: bigint }>(null as unknown as T);
}

// Tuple pattern (as const for tuple inference)
{
  const p = [M.string(), M.nat()] as const;
  type T = TypeFromPattern<typeof p>;
  expectType<[string, bigint]>(null as unknown as T);
}

// ===== 4. Combinators: or → union, and → intersection, opt, eref =====

// M.or() → union
{
  const p = M.or(M.string(), M.nat());
  type T = TypeFromPattern<typeof p>;
  expectType<string | bigint>(null as unknown as T);
}

// M.and() → intersection (mostly useful with record patterns)
{
  const p = M.and(M.string(), M.nat());
  type T = TypeFromPattern<typeof p>;
  expectType<string & bigint>(null as unknown as T);
}

// M.opt() → T | undefined
{
  const p = M.opt(M.string());
  type T = TypeFromPattern<typeof p>;
  expectType<string | undefined>(null as unknown as T);
}

// M.eref() → T | Promise<any>
{
  const p = M.eref(M.string());
  type T = TypeFromPattern<typeof p>;
  expectType<string | Promise<any>>(null as unknown as T);
}

// ===== 5. Containers: arrayOf, recordOf, mapOf =====

// M.arrayOf(M.string()) → string[]
{
  const p = M.arrayOf(M.string());
  type T = TypeFromPattern<typeof p>;
  expectType<string[]>(null as unknown as T);
}

// M.recordOf(M.string(), M.nat()) → Record<string, bigint>
{
  const p = M.recordOf(M.string(), M.nat());
  type T = TypeFromPattern<typeof p>;
  expectType<Record<string, bigint>>(null as unknown as T);
}

// M.mapOf(M.string(), M.nat()) → CopyMap
{
  const p = M.mapOf(M.string(), M.nat());
  type T = TypeFromPattern<typeof p>;
  expectAssignable<CopyMap>(null as unknown as T);
}

// ===== 6. splitRecord: required only, required + optional =====

// Required only
{
  const p = M.splitRecord({ name: M.string(), age: M.nat() });
  type T = TypeFromPattern<typeof p>;
  expectType<{ name: string; age: bigint }>(null as unknown as T);
}

// Required + optional
{
  const p = M.splitRecord(
    { name: M.string() },
    { age: M.nat(), email: M.string() },
  );
  type T = TypeFromPattern<typeof p>;
  expectType<{
    name: string;
    age?: bigint | undefined;
    email?: string | undefined;
  }>(null as unknown as T);
}

// ===== 7. splitArray: required only, required + optional =====

// Required only
{
  const p = M.splitArray([M.string(), M.nat()]);
  type T = TypeFromPattern<typeof p>;
  expectType<[string, bigint]>(null as unknown as T);
}

// Required + optional
// TS limitation: optional splitArray elements are approximated as `T | undefined`
// rather than truly optional `T?` tuple elements, because TS cannot produce
// optional tuple elements from recursive conditional types. The array must
// still be the full length. If TS gains `[X?]` in conditional types, revise.
{
  const p = M.splitArray([M.string()], [M.nat(), M.boolean()]);
  type T = TypeFromPattern<typeof p>;
  expectType<[string, bigint | undefined, boolean | undefined]>(
    null as unknown as T,
  );
}

// ===== 8. Hint parameters (type narrowing) =====

// M.string<`${bigint}`>() → `${bigint}`
{
  const p = M.string<`${bigint}`>();
  type T = TypeFromPattern<typeof p>;
  expectType<`${bigint}`>(null as unknown as T);
}

// M.number<1 | 2 | 3>() → 1 | 2 | 3
{
  const p = M.number<1 | 2 | 3>();
  type T = TypeFromPattern<typeof p>;
  expectType<1 | 2 | 3>(null as unknown as T);
}

// M.remotable<Brand>() with a branded type
{
  type Brand = RemotableBrand<{}, { getBrand: () => string }>;
  const p = M.remotable<Brand>('Brand');
  type T = TypeFromPattern<typeof p>;
  expectType<Brand>(null as unknown as T);
}

// M.promise<Payment>() → Promise<Payment>
{
  type Payment = RemotableObject;
  const p = M.promise<Payment>();
  type T = TypeFromPattern<typeof p>;
  expectType<Promise<Payment>>(null as unknown as T);
}

// ===== M.infer ergonomics (like z.infer) =====

{
  const PersonShape = M.splitRecord({
    name: M.string(),
    age: M.nat(),
  });
  type Person = M.infer<typeof PersonShape>;
  expectType<{ name: string; age: bigint }>(null as unknown as Person);
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
  expectType<{ name: string; address: { street: string; city: string } }>(
    null as unknown as T,
  );
}

// Array of records
{
  const p = M.arrayOf(M.splitRecord({ name: M.string(), value: M.nat() }));
  type T = TypeFromPattern<typeof p>;
  expectType<{ name: string; value: bigint }[]>(null as unknown as T);
}

// M.or with different matcher types
{
  const p = M.or(M.string(), M.nat(), M.boolean());
  type T = TypeFromPattern<typeof p>;
  expectType<string | bigint | boolean>(null as unknown as T);
}

// M.scalar() → ScalarKey
{
  const p = M.scalar();
  type T = TypeFromPattern<typeof p>;
  expectType<ScalarKey>(null as unknown as T);
}

// M.key() → Key
{
  const p = M.key();
  type T = TypeFromPattern<typeof p>;
  expectType<Key>(null as unknown as T);
}

// M.pattern() → Pattern
{
  const p = M.pattern();
  type T = TypeFromPattern<typeof p>;
  expectType<Pattern>(null as unknown as T);
}

// ===== 9. M.call(...).returns(...) → MethodGuard → TypeFromMethodGuard =====

// Sync method: (string, bigint) => boolean
{
  const mg = M.call(M.string(), M.nat()).returns(M.boolean());
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectType<(arg0: string, arg1: bigint) => boolean>(null as unknown as Fn);
}

// Sync method with no args: () => number
{
  const mg = M.call().returns(M.number());
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectType<() => number>(null as unknown as Fn);
}

// Sync method with optional args: (string, number | undefined) => Passable
{
  const mg = M.call(M.string()).optional(M.number()).returns();
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectType<(arg0: string, arg1: number | undefined) => Passable>(
    null as unknown as Fn,
  );
}

// Async method via callWhen: (...) => Promise<string>
{
  const mg = M.callWhen(M.nat()).returns(M.string());
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectType<(arg0: bigint) => Promise<string>>(null as unknown as Fn);
}

// Async method with M.await: M.await(M.nat()) should infer bigint arg
{
  const mg = M.callWhen(M.await(M.nat())).returns(M.string());
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectType<(arg0: bigint) => Promise<string>>(null as unknown as Fn);
}

// M.raw() args → any
{
  const mg = M.call(M.raw()).returns(M.raw());
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectType<(arg0: any) => any>(null as unknown as Fn);
}

// ===== 10. M.interface → InterfaceGuard → TypeFromInterfaceGuard =====

// Single-method interface
{
  const FooI = M.interface('Foo', {
    bar: M.call(M.string()).returns(M.nat()),
  });
  type Methods = TypeFromInterfaceGuard<typeof FooI>;
  expectType<{ bar: (arg0: string) => bigint }>(null as unknown as Methods);
}

// Multi-method interface
{
  const CounterI = M.interface('Counter', {
    incr: M.call().optional(M.number()).returns(M.number()),
    decr: M.call(M.number()).returns(M.number()),
    getValue: M.call().returns(M.number()),
  });
  type Methods = TypeFromInterfaceGuard<typeof CounterI>;
  expectType<{
    incr: (arg0: number | undefined) => number;
    decr: (arg0: number) => number;
    getValue: () => number;
  }>(null as unknown as Methods);
}

// Interface with async methods
{
  const AsyncServiceI = M.interface('AsyncService', {
    fetch: M.callWhen(M.string()).returns(M.string()),
    getAll: M.call().returns(M.arrayOf(M.string())),
  });
  type Methods = TypeFromInterfaceGuard<typeof AsyncServiceI>;
  expectType<{
    fetch: (arg0: string) => Promise<string>;
    getAll: () => string[];
  }>(null as unknown as Methods);
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
  expectType<{ brand: Brand; issuer: Issuer }>(null as unknown as IssuerRecord);

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
  expectType<{
    getIssuer: () => Issuer;
    swap: (arg0: Brand, arg1: bigint) => bigint;
    swapAsync: (arg0: Brand) => Promise<bigint>;
  }>(null as unknown as ExchangeMethods);

  // Show that a methods object satisfies the inferred type
  const methods: ExchangeMethods = {
    getIssuer() {
      return null as unknown as Issuer;
    },
    swap(_brand, amount) {
      // _brand is inferred as Brand, amount as bigint
      expectType<Brand>(_brand);
      expectType<bigint>(amount);
      return amount;
    },
    swapAsync(_brand) {
      expectType<Brand>(_brand);
      return Promise.resolve(0n);
    },
  };
  // eslint-disable-next-line no-void
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
  expectType<{ value: string | bigint; label: string }>(null as unknown as T);
}

// M.opt in method guard position (via M.or desugaring)
{
  const mg = M.call(M.opt(M.string())).returns(M.boolean());
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectType<(arg0: string | undefined) => boolean>(null as unknown as Fn);
}

// M.eref in method guard position
{
  const mg = M.call(M.eref(M.nat())).returns(M.string());
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectType<(arg0: bigint | Promise<any>) => string>(null as unknown as Fn);
}

// Nested arrayOf inside splitRecord
{
  const shape = M.splitRecord({
    items: M.arrayOf(M.splitRecord({ id: M.nat(), name: M.string() })),
    count: M.nat(),
  });
  type T = TypeFromPattern<typeof shape>;
  expectType<{
    items: { id: bigint; name: string }[];
    count: bigint;
  }>(null as unknown as T);
}

// ===== M.interface backward compat: unparameterized MethodGuard =====
{
  // Verify that using MethodGuard without type params still works
  type MG = import('../index.js').MethodGuard;
  const mg: MG = null as any;
  expectAssignable<MG>(mg);
  // The broad MethodGuard is assignable from a specific one
  const specific = M.call(M.string()).returns(M.nat());
  expectAssignable<MG>(specific);
}

// ===== Matchers that return unbranded Matcher (no TypeFromPattern inference) =====

// M.not() → Passable (negation can't narrow)
{
  const p = M.not(M.string());
  type T = TypeFromPattern<typeof p>;
  expectType<Passable>(null as unknown as T);
}

// M.kind('boolean') → boolean (explicit kind call)
{
  const p = M.kind('boolean');
  type T = TypeFromPattern<typeof p>;
  expectType<boolean>(null as unknown as T);
}

// M.kind('copyRecord') → CopyRecord
{
  const p = M.kind('copyRecord');
  type T = TypeFromPattern<typeof p>;
  expectType<CopyRecord>(null as unknown as T);
}

// M.set() → CopySet (via kind)
{
  const p = M.set();
  type T = TypeFromPattern<typeof p>;
  expectType<CopySet>(null as unknown as T);
}

// M.bag() → CopyBag (via kind)
{
  const p = M.bag();
  type T = TypeFromPattern<typeof p>;
  expectType<CopyBag>(null as unknown as T);
}

// M.map() → CopyMap (via kind)
{
  const p = M.map();
  type T = TypeFromPattern<typeof p>;
  expectType<CopyMap>(null as unknown as T);
}

// ===== Edge cases =====

// Empty splitRecord → {}
{
  const p = M.splitRecord({});
  type T = TypeFromPattern<typeof p>;
  expectType<{}>(null as unknown as T);
}

// Empty splitArray → []
{
  const p = M.splitArray([]);
  type T = TypeFromPattern<typeof p>;
  expectType<[]>(null as unknown as T);
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
  expectType<{ a: { b: { c: { d: string } } } }>(null as unknown as T);
}

// M.or with many branches
{
  const p = M.or(M.string(), M.nat(), M.boolean(), M.remotable());
  type T = TypeFromPattern<typeof p>;
  expectType<
    string | bigint | boolean | RemotableObject | RemotableBrand<any, any>
  >(null as unknown as T);
}

// recordOf with no args defaults to Record<string, any>
// TS limitation: TypeFromPattern defaults to Record<string, any> because
// the default Pattern type parameter erases to the Passable union, which
// doesn't simplify further.
{
  const p = M.recordOf();
  type T = TypeFromPattern<typeof p>;
  expectAssignable<Record<string, any>>(null as unknown as T);
}

// ===== Comparison matchers → Key =====

{
  const p = M.lt(42);
  type T = TypeFromPattern<typeof p>;
  expectType<Key>(null as unknown as T);
}
{
  const p = M.lte('foo');
  type T = TypeFromPattern<typeof p>;
  expectType<Key>(null as unknown as T);
}
{
  const p = M.eq(100n);
  type T = TypeFromPattern<typeof p>;
  expectType<Key>(null as unknown as T);
}
{
  const p = M.neq(true);
  type T = TypeFromPattern<typeof p>;
  expectType<Key>(null as unknown as T);
}
{
  const p = M.gte(0);
  type T = TypeFromPattern<typeof p>;
  expectType<Key>(null as unknown as T);
}
{
  const p = M.gt(-1);
  type T = TypeFromPattern<typeof p>;
  expectType<Key>(null as unknown as T);
}

// ===== setOf / bagOf / tagged / containerHas =====

// setOf with element pattern
{
  const p = M.setOf(M.string());
  type T = TypeFromPattern<typeof p>;
  expectType<CopySet<string>>(null as unknown as T);
}

// bagOf with element pattern
{
  const p = M.bagOf(M.nat());
  type T = TypeFromPattern<typeof p>;
  expectType<CopyBag<bigint>>(null as unknown as T);
}

// tagged with tag pattern
{
  const p = M.tagged(M.string());
  type T = TypeFromPattern<typeof p>;
  expectType<CopyTagged<string, Passable>>(null as unknown as T);
}

// containerHas → Passable
{
  const p = M.containerHas(M.string());
  type T = TypeFromPattern<typeof p>;
  expectType<Passable>(null as unknown as T);
}

// ===== M.eref and M.opt =====

// eref infers T | Promise<any>
{
  const p = M.eref(M.string());
  type T = TypeFromPattern<typeof p>;
  expectType<string | Promise<any>>(null as unknown as T);
}

// opt infers T | undefined
{
  const p = M.opt(M.nat());
  type T = TypeFromPattern<typeof p>;
  expectType<bigint | undefined>(null as unknown as T);
}

// ===== matches type guard (narrows in if-blocks) =====

{
  const value: unknown = null as any;
  if (matches(value, M.string())) {
    expectType<string>(value);
  }
}

{
  const value: unknown = null as any;
  if (matches(value, M.splitRecord({ name: M.string(), age: M.nat() }))) {
    expectType<{ name: string; age: bigint }>(value);
  }
}

{
  const value: unknown = null as any;
  if (matches(value, M.or(M.string(), M.nat()))) {
    expectType<string | bigint>(value);
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
  expectType<string>(value);
}

{
  const value: unknown = null as any;
  mustMatch(value, M.splitRecord({ x: M.nat(), y: M.nat() }));
  expectType<{ x: bigint; y: bigint }>(value);
}

// ===== M.remotable with InterfaceGuard type parameter =====

// Default M.remotable() → broad remotable union (unchanged)
{
  const p = M.remotable();
  type T = TypeFromPattern<typeof p>;
  expectType<RemotableObject | RemotableBrand<any, any>>(null as unknown as T);
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
  expectAssignable<{ getData: () => string; getCount: () => bigint }>(
    null as unknown as T,
  );
  expectAssignable<RemotableObject>(null as unknown as T);
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
  expectAssignable<{ getData: () => string }>(null as unknown as PublicFacet);
  expectAssignable<RemotableObject>(null as unknown as PublicFacet);
}

// TypeFromMethodGuard resolves remotable return guard
{
  const FooI = M.interface('Foo', {
    bar: M.call().returns(M.string()),
  });
  const mg = M.call().returns(M.remotable<typeof FooI>('Foo'));
  type Fn = TypeFromMethodGuard<typeof mg>;
  type Ret = ReturnType<Fn>;
  expectAssignable<{ bar: () => string }>(null as unknown as Ret);
  expectAssignable<RemotableObject>(null as unknown as Ret);
}

// ===== M.interface with sloppy/defaultGuards options =====

// M.interface with no options → typed InterfaceGuard
{
  const FooI = M.interface('Foo', {
    bar: M.call(M.string()).returns(M.nat()),
  });
  type Methods = TypeFromInterfaceGuard<typeof FooI>;
  expectType<{ bar: (arg0: string) => bigint }>(null as unknown as Methods);
}

// M.interface with explicit strict options → typed InterfaceGuard
{
  const FooI = M.interface(
    'Foo',
    { bar: M.call(M.string()).returns(M.nat()) },
    { defaultGuards: undefined },
  );
  type Methods = TypeFromInterfaceGuard<typeof FooI>;
  expectType<{ bar: (arg0: string) => bigint }>(null as unknown as Methods);
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
  expectAssignable<Record<string, (...args: any[]) => any>>(
    null as unknown as Methods,
  );
}

// ===== M.infer (via namespace import) =====
{
  const shape = M.splitRecord({ x: M.nat() });
  type T = M.infer<typeof shape>;
  expectType<{ x: bigint }>(null as unknown as T);
}

{
  // M.infer with complex nested pattern
  const shape = M.splitRecord({
    name: M.string(),
    scores: M.arrayOf(M.number()),
    metadata: M.splitRecord({ version: M.nat() }, { description: M.string() }),
  });
  type T = M.infer<typeof shape>;
  expectType<{
    name: string;
    scores: number[];
    metadata: {
      version: bigint;
      description?: string | undefined;
    };
  }>(null as unknown as T);
}
