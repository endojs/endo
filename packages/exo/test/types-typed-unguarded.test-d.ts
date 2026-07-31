import { expectTypeOf } from 'expect-type';
import type { Passable } from '@endo/pass-style';
import { makeExo, defineExoClass } from '../index.js';

// ===== Typed implementation, no guard (impl wins) =====
//
// When the developer annotates parameter types explicitly and passes
// `undefined` as the interfaceGuard, the implementation's types flow
// through to the returned exo unchanged — including parameter names.

// makeExo with undefined guard and typed methods
{
  const exo = makeExo('Greeter', undefined, {
    greet(name: string, loud: boolean) {
      return loud ? `HELLO ${name}` : `hello ${name}`;
    },
  });
  expectTypeOf(exo).toExtend<Passable>();
  // Parameter names and types from the implementation are preserved
  expectTypeOf(exo.greet).toEqualTypeOf<
    (name: string, loud: boolean) => string
  >();
}

// defineExoClass with undefined guard and typed init/methods
{
  const makeCounter = defineExoClass(
    'Counter',
    undefined,
    (start: bigint) => ({ count: start }),
    {
      incr(step: bigint) {
        this.state.count += step;
        return this.state.count;
      },
      read() {
        return this.state.count;
      },
    },
  );
  const counter = makeCounter(0n);
  expectTypeOf(counter).toExtend<Passable>();
  // Parameter name `step` and type `bigint` come from the implementation
  expectTypeOf(counter.incr).toEqualTypeOf<(step: bigint) => bigint>();
  expectTypeOf(counter.read).toEqualTypeOf<() => bigint>();
}

// Verifying that parameter names from typed implementation are preserved
// even with multiple parameters
{
  const exo = makeExo('Math', undefined, {
    add(a: number, b: number) {
      return a + b;
    },
    clamp(value: number, min: number, max: number) {
      return Math.max(min, Math.min(max, value));
    },
  });
  expectTypeOf(exo.add).toEqualTypeOf<(a: number, b: number) => number>();
  expectTypeOf(exo.clamp).toEqualTypeOf<
    (value: number, min: number, max: number) => number
  >();
}
