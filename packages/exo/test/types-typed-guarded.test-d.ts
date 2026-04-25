/* eslint-disable no-lone-blocks, no-empty-function */
import { expectAssignable, expectType } from 'tsd';
import type { Passable } from '@endo/pass-style';
import { M } from '@endo/patterns';
import { defineExoClass } from '../index.js';
import type { GuardedMethods } from '../src/types.js';

const CounterI = M.interface('Counter', {
  incr: M.call().optional(M.nat()).returns(M.nat()),
  read: M.call().returns(M.nat()),
});

// ===== Typed implementation + guard (compatibility check) =====
//
// When the developer provides BOTH explicit parameter types in the
// implementation AND an InterfaceGuard, TypeScript checks compatibility
// between them.  The return type uses the implementation's types
// (preserving parameter names), not the guard's.

// Guard validates impl at compile time but return type uses impl (param names preserved)
{
  const makeCounter = defineExoClass(
    'Counter',
    CounterI,
    (start: bigint) => ({ count: start }),
    {
      incr(step: bigint = 1n) {
        this.state.count += step;
        return this.state.count;
      },
      read() {
        return this.state.count;
      },
    },
  );
  const counter = makeCounter(0n);
  expectAssignable<Passable>(counter);

  // The exo's `incr` has the impl's param name `step`
  expectType<(step: bigint) => bigint>(counter.incr);
  expectType<() => bigint>(counter.read);
}

// GuardedMethods utility type: extracts guard types with impl param names
{
  const makeCounter = defineExoClass(
    'Counter',
    CounterI,
    (start: bigint) => ({ count: start }),
    {
      incr(step: bigint = 1n) {
        this.state.count += step;
        return this.state.count;
      },
      read() {
        return this.state.count;
      },
    },
  );
  const counter = makeCounter(0n);

  // GuardedMethods re-derives from the guard but keeps impl param names
  type CM = GuardedMethods<typeof counter>;

  // The guard declares `incr` with .optional(M.nat()), so the param is optional.
  // The impl's param name `step` is preserved.
  expectType<(step?: bigint) => bigint>(null as unknown as CM['incr']);
  expectType<() => bigint>(null as unknown as CM['read']);
}

// Limitation:
// TypeScript treats object-literal methods as *bivariant* in their parameter
// types, even under `--strictFunctionTypes`. This means an implementation may
// accept a *narrower* parameter type than required by the interface and still
// type-check.
//
// As a result, Guarded<M> cannot fully enforce that implementations accept
// all inputs allowed by the interface when methods are written using method
// syntax (`foo(x: T): U`).
//
// See: https://github.com/microsoft/TypeScript/wiki/FAQ#why-are-function-parameters-bivariant
//
// Note: Using function-valued properties enables stricter checking, but changes
// `this` semantics and is not suitable for Exo method definitions.
{
  const makeCounter = defineExoClass(
    'Counter',
    CounterI,
    (start: bigint) => ({ count: start }),
    {
      // NOT an error — method shorthand is bivariant even with
      // strictFunctionTypes; bigint is assignable to bigint | number
      incr(step: bigint | number = 1) {
        this.state.count += BigInt(step);
        return this.state.count;
      },
      read() {
        return this.state.count;
      },
    },
  );
  const counter = makeCounter(0n);
  counter.incr(1n);
  // @ts-expect-error 'number' not compatible with the guard's type 'bigint'
  counter.incr(1);
  // The above only errors under strict mode, so before we had that enabled we also did this check, which is still valid:
  const cm: GuardedMethods<typeof counter> = counter;
  // @ts-expect-error
  cm.incr(1); // GuardedMethods reflects the guard's type, so this is an error.
}
