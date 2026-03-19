/* eslint-disable no-lone-blocks, no-empty-function */
// eslint-disable-next-line import/no-extraneous-dependencies
import { expectAssignable, expectType } from 'tsd';
import type { Passable, RemotableObject } from '@endo/pass-style';
import { M } from '@endo/patterns';
import type {
  TypeFromInterfaceGuard,
  TypeFromMethodGuard,
} from '@endo/patterns';
import { makeExo, defineExoClass, defineExoClassKit } from '../index.js';

// ===== .rest() — rest parameter inference =====

// .rest(M.string()) appends ...rest: string[]
{
  const mg = M.call(M.nat()).rest(M.string()).returns(M.boolean());
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectType<(n: bigint, ...rest: string[]) => boolean>(null as unknown as Fn);
}

// .rest(M.any()) appends ...rest: Passable[]
{
  const mg = M.call().rest(M.any()).returns();
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectType<(...rest: Passable[]) => undefined>(null as unknown as Fn);
}

// .rest(M.raw()) appends ...rest: any[]
{
  const mg = M.call(M.string()).rest(M.raw()).returns(M.nat());
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectType<(s: string, ...rest: any[]) => bigint>(null as unknown as Fn);
}

// No .rest() → no rest parameter (existing behavior preserved)
{
  const mg = M.call(M.string()).returns(M.nat());
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectType<(s: string) => bigint>(null as unknown as Fn);
}

// .rest() with .optional()
{
  const mg = M.call(M.string())
    .optional(M.nat())
    .rest(M.boolean())
    .returns(M.string());
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectType<(s: string, n?: bigint, ...rest: boolean[]) => string>(
    null as unknown as Fn,
  );
}

// .rest() negative: wrong rest element type is caught
{
  const FooI = M.interface('Foo', {
    gather: M.call().rest(M.string()).returns(),
  });
  // @ts-expect-error -- rest args must be string[], not number[]
  makeExo('Foo', FooI, {
    gather(...items: number[]) {},
  });
}

// .rest() negative: extra positional arg not in guard is caught via rest type
{
  const mg = M.call(M.nat()).rest(M.string()).returns(M.boolean());
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectType<(n: bigint, goodRest: string, badRest: boolean) => boolean>(
    // @ts-expect-error -- third positional must be string (from rest), not boolean
    null as unknown as Fn,
  );
}

// ===== M.callWhen: async method guards =====
//
// M.callWhen() is the async counterpart to M.call().  The runtime:
//   1. Wraps the call so the observable return is always Promise<T>.
//   2. Awaits any M.await(pattern) arguments before invoking the
//      implementation, so the implementation receives the resolved value,
//      not the promise.
//   3. Passes M.promise() arguments straight through — the implementation
//      receives the Promise object itself (no unwrapping).

// M.callWhen with no args returns Promise<string>
{
  const mg = M.callWhen().returns(M.string());
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectType<() => Promise<string>>(null as unknown as Fn);
}

// M.callWhen with M.await(pattern): implementation receives the awaited value
// M.await(M.nat()) → arg type is bigint (unwrapped), NOT Promise<bigint>
{
  const mg = M.callWhen(M.await(M.nat())).returns(M.string());
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectType<(n: bigint) => Promise<string>>(null as unknown as Fn);
}

// M.promise() as a plain (non-awaited) arg: the runtime passes the Promise
// object straight through to the implementation (no unwrapping).
// M.promise() has default Payload `any`, and TFStructural's 'promise' branch
// produces Promise<any>.
{
  const mg = M.callWhen(M.promise()).returns(M.string());
  type Fn = TypeFromMethodGuard<typeof mg>;
  expectType<(p: Promise<any>) => Promise<string>>(null as unknown as Fn);
}

// M.callWhen with mixed args: M.await + plain pattern
{
  const mg = M.callWhen(M.await(M.nat()), M.string()).returns(M.boolean());
  type Fn = TypeFromMethodGuard<typeof mg>;
  // first arg awaited (bigint), second passed as-is (string)
  expectType<(n: bigint, s: string) => Promise<boolean>>(null as unknown as Fn);
}

// M.callWhen with an exo as awaited argument (M.await(M.remotable<typeof I>()))
// The implementation receives the typed exo object, not a Promise of one.
{
  const SourceI = M.interface('Source', {
    read: M.call().returns(M.string()),
  });
  const mg = M.callWhen(M.await(M.remotable<typeof SourceI>('Source'))).returns(
    M.nat(),
  );
  type Fn = TypeFromMethodGuard<typeof mg>;
  // arg: the exo object with read() method + remotable branding (already awaited)
  type Arg0 = Parameters<Fn>[0];
  expectAssignable<{ read: () => string }>(null as unknown as Arg0);
  expectAssignable<RemotableObject>(null as unknown as Arg0);
  // return: Promise<bigint>
  expectType<Promise<bigint>>(null as unknown as ReturnType<Fn>);
}

// M.callWhen returning an exo (M.remotable<typeof I>()) — return is Promise<ExoType>
{
  const ResultI = M.interface('Result', {
    getValue: M.call().returns(M.nat()),
  });
  const mg = M.callWhen().returns(M.remotable<typeof ResultI>('Result'));
  type Fn = TypeFromMethodGuard<typeof mg>;
  type Ret = ReturnType<Fn>;
  // Ret is Promise<{ getValue: () => bigint } & RemotableObject & ...>
  expectAssignable<Promise<{ getValue: () => bigint }>>(null as unknown as Ret);
}

// makeExo with M.callWhen: observable method returns Promise<T>,
// implementation uses async to return Promise<T> as required by the constraint.
// The runtime awaits M.await() args before invoking the implementation, so
// implementation parameters are the resolved (non-Promise) types.
{
  const AsyncI = M.interface('Async', {
    // getStringOf awaits its arg (any Passable), then converts to string
    getStringOf: M.callWhen(M.await(M.any())).returns(M.string()),
    // double awaits a nat, returns its double
    double: M.callWhen(M.await(M.nat())).returns(M.nat()),
  });

  type AsyncMethods = TypeFromInterfaceGuard<typeof AsyncI>;
  // getStringOf: implementation receives the awaited value (Passable), returns Promise<string>
  expectAssignable<(val: Passable) => Promise<string>>(
    null as unknown as AsyncMethods['getStringOf'],
  );
  // double: arg is bigint (awaited nat), return is Promise<bigint>
  expectAssignable<(n: bigint) => Promise<bigint>>(
    null as unknown as AsyncMethods['double'],
  );

  const exo = makeExo('Async', AsyncI, {
    async getStringOf(val) {
      // val: Passable — the awaited, unwrapped value (not a Promise)
      expectAssignable<Passable>(val);
      return String(val);
    },
    async double(n) {
      // n: bigint — awaited nat
      expectType<bigint>(n);
      return n * 2n;
    },
  });

  // Callers see Promise<T> returns on the exo object
  expectType<(val: Passable) => Promise<string>>(exo.getStringOf);
  expectType<(n: bigint) => Promise<bigint>>(exo.double);
  expectAssignable<Passable>(exo);
}

// defineExoClass with M.callWhen: state flows through, async return on observable
{
  const CounterI = M.interface('Counter', {
    // increment is fire-and-forget async (returns undefined)
    increment: M.callWhen(M.await(M.nat())).returns(M.undefined()),
    // read is synchronous
    read: M.call().returns(M.nat()),
  });

  const makeCounter = defineExoClass(
    'Counter',
    CounterI,
    (start: bigint) => ({ count: start }),
    {
      async increment(n) {
        // n: bigint — the awaited value (not a promise)
        expectType<bigint>(n);
        this.state.count += n;
      },
      read() {
        return this.state.count;
      },
    },
  );

  const counter = makeCounter(0n);
  // increment observable return is Promise<undefined>
  expectType<(n: bigint) => Promise<undefined>>(counter.increment);
  // read is synchronous as declared
  expectType<() => bigint>(counter.read);
}

// defineExoClassKit with M.callWhen: one facet's async method passes an exo
// from another facet to its caller via Promise return
{
  const DataI = M.interface('Data', {
    get: M.call().returns(M.string()),
  });
  const LoaderI = M.interface('Loader', {
    // loadData is async: awaits a nat key, returns the Data exo
    loadData: M.callWhen(M.await(M.nat())).returns(
      M.remotable<typeof DataI>('Data'),
    ),
  });

  const makeKit = defineExoClassKit(
    'Store',
    { data: DataI, loader: LoaderI },
    (initial: string) => ({ value: initial }),
    {
      data: {
        get() {
          return this.state.value;
        },
      },
      loader: {
        async loadData(key) {
          // key: bigint (awaited nat)
          expectType<bigint>(key);
          return this.facets.data;
        },
      },
    },
  );

  const kit = makeKit('hello');
  // loadData returns Promise<DataFacet> — typed with get() method
  type LoadResult = ReturnType<typeof kit.loader.loadData>;
  expectAssignable<Promise<{ get: () => string }>>(
    null as unknown as LoadResult,
  );
  expectAssignable<Promise<RemotableObject>>(null as unknown as LoadResult);
}
