// @ts-check
import '../src/types.js';
import { fc } from '@fast-check/ava';
import { Far } from '../src/make-far.js';
import { makeTagged } from '../src/makeTagged.js';

const { freeze } = Object;

/**
 * The only elements with identity. Everything else should be equal
 * by contents.
 */
const exampleAlice = Far('alice', {});
const exampleBob = Far('bob', {});
const exampleCarol = Far('carol', {});

const arbString = fc.oneof(fc.string(), fc.fullUnicodeString());

const arbLeaf = fc.oneof(
  fc.constantFrom(null, undefined, false, true),
  arbString,
  arbString.map(s => Symbol.for(s)),
  // primordial symbols and registered lookalikes
  fc.constantFrom(
    ...Object.getOwnPropertyNames(Symbol).flatMap(k => {
      const v = Symbol[k];
      if (typeof v !== 'symbol') return [];
      return [v, Symbol.for(k), Symbol.for(`@@${k}`)];
    }),
  ),
  fc.bigInt(),
  fc.integer(),
  fc.constantFrom(-0, NaN, Infinity, -Infinity),
  fc.record({}),
  fc.constantFrom(exampleAlice, exampleBob, exampleCarol),
  arbString.map(s => new Error(s)),
  // unresolved promise
  fc.constant(new Promise(() => {})),
);

const { arbDag } = fc.letrec(tie => {
  return {
    arbDag: fc.oneof(
      { withCrossShrink: true },
      arbLeaf,
      tie('arbDag').map(v => Promise.resolve(v)),
      fc.array(tie('arbDag')),
      fc.dictionary(
        arbString.filter(s => s !== 'then'),
        tie('arbDag'),
      ),
      // A tagged value, either of arbitrary type with arbitrary payload
      // or of known type with arbitrary or explicitly valid payload.
      // Ordered by increasing complexity.
      fc
        .oneof(
          fc.record({ type: arbString, payload: tie('arbDag') }),
          fc.record({
            type: fc.constantFrom('copySet'),
            payload: fc.oneof(
              tie('arbDag'),
              // copySet valid payload is an array of unique passables.
              // TODO: A valid copySet payload must be a reverse sorted array,
              // so we should generate some of those as well.
              fc.uniqueArray(tie('arbDag')),
            ),
          }),
          fc.record({
            type: fc.constantFrom('copyBag'),
            payload: fc.oneof(
              tie('arbDag'),
              // copyBag valid payload is an array of [passable, count] tuples
              // in which each passable is unique.
              // TODO: A valid copyBag payload must be a reverse sorted array,
              // so we should generate some of those as well.
              fc.uniqueArray(fc.tuple(tie('arbDag'), fc.bigInt()), {
                selector: entry => entry[0],
              }),
            ),
          }),
          fc.record({
            type: fc.constantFrom('copyMap'),
            payload: fc.oneof(
              tie('arbDag'),
              // copyMap valid payload is a
              // `{ keys: Passable[], values: Passable[]}`
              // record in which keys are unique and both arrays have the
              // same length.
              // TODO: In a valid copyMap payload, the keys must be a
              // reverse sorted array, so we should generate some of
              // those as well.
              fc
                .uniqueArray(
                  fc.record({ key: tie('arbDag'), value: tie('arbDag') }),
                  { selector: entry => entry.key },
                )
                .map(entries => ({
                  keys: entries.map(({ key }) => key),
                  values: entries.map(({ value }) => value),
                })),
            ),
          }),
        )
        .map(({ type, payload }) => makeTagged(type, payload)),
    ),
  };
});

/**
 * A factory for arbitrary passables
 */
export const arbPassable = arbDag.map(x => harden(x));

// NOTE: Not hardened because the arbs it contains cannot generally be hardened.
// TODO: Why not? What would be needed so that arbs can be hardened?
export const arbPassableKit = freeze({
  exampleAlice,
  exampleBob,
  exampleCarol,
  arbString,
  arbLeaf,
  arbPassable,
});
