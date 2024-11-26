// @ts-check
import '../src/types.js';
import { fc } from '@fast-check/ava';
import { Far } from '../src/make-far.js';
import { makeTagged } from '../src/makeTagged.js';

/**
 * The only elements with identity. Everything else should be equal
 * by contents.
 */
export const exampleAlice = Far('alice', {});
export const exampleBob = Far('bob', {});
export const exampleCarol = Far('carol', {});

export const arbString = fc.oneof(fc.string(), fc.fullUnicodeString());

const keyableLeaves = [
  fc.constantFrom(null, undefined, false, true),
  arbString,
  fc.bigInt(),
  fc.integer(),
  fc.constantFrom(-0, NaN, Infinity, -Infinity),
  fc.record({}),
  fc.constantFrom(exampleAlice, exampleBob, exampleCarol),
];

export const arbKeyLeaf = fc.oneof(...keyableLeaves);

export const arbLeaf = fc.oneof(
  ...keyableLeaves,
  arbString.map(s => Error(s)),
  // unresolved promise
  fc.constant(new Promise(() => {})),
);

const { keyDag } = fc.letrec(tie => {
  return {
    keyDag: fc.oneof(
      { withCrossShrink: true },
      arbKeyLeaf,
      fc.array(tie('keyDag')),
      fc.dictionary(
        arbString.filter(s => s !== 'then'),
        tie('keyDag'),
      ),
    ),
  };
});

const { arbDag } = fc.letrec(tie => {
  return {
    arbDag: fc.oneof(
      { withCrossShrink: true },
      arbLeaf,
      fc.array(tie('arbDag')),
      fc.dictionary(
        arbString.filter(s => s !== 'then'),
        tie('arbDag'),
      ),
      // A promise for a passable.
      tie('arbDag').map(v => Promise.resolve(v)),
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
        .map(({ type, payload }) =>
          makeTagged(
            type,
            /** @type {import('../src/types.js').Passable} */ (payload),
          ),
        ),
    ),
  };
});

/**
 * A factory for arbitrary keys.
 */
export const arbKey = keyDag.map(x => harden(x));

/**
 * A factory for arbitrary passables.
 */
export const arbPassable = arbDag.map(x => harden(x));
