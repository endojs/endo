/* eslint-disable no-lone-blocks, no-empty-function */
import { expectAssignable, expectType } from 'tsd';
import type { Passable } from '@endo/pass-style';
import { M } from '@endo/patterns';
import { defineExoClass } from '../index.js';
import type { GuardedMethods } from '../src/types.js';

// ===== Typed implementation + guard (compatibility check) =====
//
// When the developer provides BOTH explicit parameter types in the
// implementation AND an InterfaceGuard, TypeScript checks compatibility
// between them.  The return type uses the implementation's types
// (preserving parameter names), not the guard's.

// Guard validates impl at compile time but return type uses impl (param names preserved)
{
  const CounterI = M.interface('Counter', {
    incr: M.call().optional(M.nat()).returns(M.nat()),
    read: M.call().returns(M.nat()),
  });
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
  const CounterI = M.interface('Counter', {
    incr: M.call().optional(M.nat()).returns(M.nat()),
    read: M.call().returns(M.nat()),
  });
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
