// @ts-check
import { objectMap } from '@endo/common/object-map.js';
import '../src/types.js';
import { Far } from '../src/make-far.js';
import { makeTagged } from '../src/makeTagged.js';
import { nameForPassableSymbol, passableSymbolForName } from '../src/symbol.js';

/**
 * @import { Arbitrary } from 'fast-check';
 * @import { Key } from '@endo/patterns';
 * @import { Passable, CopyTagged } from '../src/types.js';
 */

/** Avoid wasting time on overly large data structures. */
const maxLength = 100;

/** @type ((reason: string) => never) */
const reject = reason => {
  throw Error(reason);
};

/**
 * The only elements with identity. Everything else should be equal
 * by contents.
 */
export const exampleAlice = Far('alice', {});
export const exampleBob = Far('bob', {});
export const exampleCarol = Far('carol', {});

/**
 * @template {Passable} T
 * @template {Passable} U
 * @typedef {[T, U?] | [T[], U[]?] | [Record<string, T>, Record<string, U>?] | [CopyTagged<string, T | T[] | Record<string, T>>, CopyTagged<string, U | U[] | Record<string, U>>?]} LiftedInput
 */

/**
 * Make fast-check arbitraries for various kinds of passables.
 * The recursive types arbKey and arbPassable also support "lifting" to replace
 * each produced value with a [value, lifted] pair, where `lifted` is the output
 * of a `lift([leaf], detail)` or  `lift([composite, liftedParts], detail)`
 * invocation in which `detail` is drawn from `arbLiftingDetail`.
 *
 * @template {Passable} [Lifted=Passable]
 * @template [LiftingDetail=unknown]
 * @param {typeof import('@fast-check/ava').fc} fc
 * @param {object} [options]
 * @param {Array<'byteArray'>} [options.excludePassStyles]
 * @param {<T extends Passable>(input: LiftedInput<T, Lifted>, detail: LiftingDetail) => T | Lifted} [options.lift]
 * @param {Arbitrary<LiftingDetail>} [options.arbLiftingDetail]
 */
export const makeArbitraries = (
  fc,
  {
    excludePassStyles = [],
    lift = /** @type {any} */ (([x]) => x),
    arbLiftingDetail = /** @type {any} */ (fc.constant(undefined)),
  } = {},
) => {
  const arbString = fc.oneof(
    fc.string({ unit: 'grapheme-ascii' }),
    fc.string(),
  );
  const notThen = arbString.filter(s => s !== 'then');

  /** @type {(Arbitrary<Key>)[]} */
  const keyableLeaves = [
    fc.constantFrom(null, undefined, false, true),
    arbString,
    arbString
      // TODO Once we flip symbol representation, we should revisit everywhere
      // we make a special case of "@@". It may no longer be appropriate.
      .filter(s => !s.startsWith('@@'))
      .map(
        s => passableSymbolForName(s),
        v =>
          nameForPassableSymbol(/** @type {any} */ (v)) ??
          reject('not a passable symbol'),
      ),
    // primordial symbols and registered lookalikes
    fc.constantFrom(
      ...Object.getOwnPropertyNames(Symbol).flatMap(k => {
        const v = Symbol[k];
        if (typeof v !== 'symbol') return [];
        return [v, passableSymbolForName(k), passableSymbolForName(`@@@@${k}`)];
      }),
    ),
    fc.bigInt(),
    fc.integer(),
    // Using `sliceToImmutable` rather than `transferToImmutable` only
    // because we may go through a phase where only `sliceToImmutable` is
    // provided when the shim is run on Hermes.
    // See https://github.com/endojs/endo/pull/2785
    ...[fc.uint8Array().map(arr => arr.buffer.sliceToImmutable())].filter(
      () => !excludePassStyles.includes('byteArray'),
    ),
    fc.constantFrom(-0, NaN, Infinity, -Infinity),
    // This was producing null-prototype objects:
    // fc.record({}),
    fc.constant(undefined).map(() => ({})),
    fc.constantFrom(exampleAlice, exampleBob, exampleCarol),
  ];

  const arbKeyLeaf = fc.oneof(...keyableLeaves);

  const arbLeaf = fc.oneof(
    ...keyableLeaves,
    arbString.map(
      s => Error(s),
      v => (v instanceof Error ? v.message : reject('not an Error')),
    ),
    // unresolved promise
    fc.constant(new Promise(() => {})),
  );

  const recoverabilityCache = new WeakMap();
  /** @type {<T, U extends WeakKey>(arb: Arbitrary<T>, mapper: (input: T) => U) => Arbitrary<U>} */
  const recoverableMap = (arb, mapper) =>
    arb.map(
      recoverableInput => {
        const result = mapper(recoverableInput);
        recoverabilityCache.set(result, recoverableInput);
        return result;
      },
      v => {
        const found = recoverabilityCache.get(/** @type {any} */ (v));
        if (found !== undefined || recoverabilityCache.has(found)) return found;
        reject('not a cached output');
      },
    );

  /**
   * @template {Passable} [T=Passable]
   * @template {Lifted} [U=Lifted]
   * @typedef {[T, U]} LiftedPair
   */
  /** @type {<T>(arb: Arbitrary<T>, makeLiftArgs: (input: T) => Parameters<typeof lift>[0]) => Arbitrary<LiftedPair>} */
  const withLiftingDetail = (arb, makeLiftArgs) =>
    recoverableMap(fc.tuple(arb, arbLiftingDetail), input => {
      const [specimen, detail] = input;
      const args = makeLiftArgs(specimen);
      return /** @type {LiftedPair} */ ([args[0], lift(args, detail)]);
    });

  const recursives = fc.letrec(tie => ({
    liftedKeyDag: fc.oneof(
      { withCrossShrink: true },
      // Base case: lift a leaf into a [leaf, lifted] pair.
      withLiftingDetail(arbKeyLeaf, leaf => [leaf]),
      // Recursive cases: compose lifted pairs, project into an [unlifted, liftedParts] pair,
      // and lift that.
      withLiftingDetail(
        fc.oneof(
          // copyArray
          recoverableMap(
            fc.array(tie('liftedKeyDag'), { maxLength }),
            pairsArr => [0, 1].map(i => pairsArr.map(pair => pair[i])),
          ),
          // copyRecord
          recoverableMap(
            fc.dictionary(notThen, tie('liftedKeyDag'), { maxKeys: maxLength }),
            pairsRec => [0, 1].map(i => objectMap(pairsRec, p => p[i])),
          ),
        ),
        ([compositeKey, liftedParts]) =>
          /** @type {any} */ ([compositeKey, liftedParts]),
      ),
    ),
    liftedArbDag: fc.oneof(
      { withCrossShrink: true },
      // Base case: lift a leaf into a [leaf, lifted] pair.
      withLiftingDetail(arbLeaf, leaf => [leaf]),
      // Recursive cases: compose lifted pairs, project into an [unlifted, liftedParts] pair,
      // and lift that.
      withLiftingDetail(
        fc.oneof(
          // copyArray
          recoverableMap(
            fc.array(tie('liftedArbDag'), { maxLength }),
            pairsArr => [0, 1].map(i => pairsArr.map(pair => pair[i])),
          ),
          // copyRecord
          recoverableMap(
            fc.dictionary(notThen, tie('liftedArbDag'), { maxKeys: maxLength }),
            pairsRec => [0, 1].map(i => objectMap(pairsRec, p => p[i])),
          ),
          // promise
          recoverableMap(tie('liftedArbDag'), pair =>
            [0, 1].map(i => Promise.resolve(pair[i])),
          ),
          // arbitrary tagged (but maybe using a known tag)
          recoverableMap(
            fc.tuple(
              fc.oneof(
                arbString,
                fc.constantFrom('copySet', 'copyBag', 'copyMap'),
              ),
              tie('liftedArbDag'),
            ),
            ([tag, payloadPair]) =>
              [0, 1].map(i => makeTagged(tag, payloadPair[i])),
          ),
          // copySet: an array of unique Passables
          // TODO: A valid copySet payload must be a reverse sorted array.
          recoverableMap(
            fc.uniqueArray(tie('liftedKeyDag'), {
              maxLength,
              selector: pair => pair[0],
            }),
            pairsArr =>
              [0, 1].map(i =>
                makeTagged(
                  'copySet',
                  pairsArr.map(pair => pair[i]),
                ),
              ),
          ),
          // copyBag: an array of [Passable, count] tuples in which each Passable is unique
          // TODO: A valid copyBag payload must be a reverse sorted array.
          recoverableMap(
            fc.uniqueArray(
              fc.tuple(tie('liftedKeyDag'), fc.bigInt({ min: 1n })),
              { maxLength, selector: pairKeyedEntry => pairKeyedEntry[0][0] },
            ),
            pairKeyedEntries =>
              [0, 1].map(i =>
                makeTagged(
                  'copyBag',
                  pairKeyedEntries.map(([pair, value]) => [pair[i], value]),
                ),
              ),
          ),
          // copyMap: a `{ keys: Passable[], values: Passable[] }` record in which keys are unique and both arrays have the same length
          // TODO: A valid copyMap payload must be a reverse sorted array.
          recoverableMap(
            fc.uniqueArray(fc.tuple(tie('liftedKeyDag'), tie('liftedArbDag')), {
              maxLength,
              selector: pairKeyedEntry => pairKeyedEntry[0][0],
            }),
            pairKeyedEntries =>
              [0, 1].map(i =>
                makeTagged(
                  'copyMap',
                  pairKeyedEntries.map(([keyPair, valuePair]) => [
                    keyPair[i],
                    valuePair[i],
                  ]),
                ),
              ),
          ),
        ),
        ([specimen, liftedParts]) =>
          /** @type {any} */ ([specimen, liftedParts]),
      ),
    ),
  }));
  const { liftedKeyDag, liftedArbDag } = /** @type {{
   *    liftedKeyDag: Arbitrary<LiftedPair<Key, Lifted>>,
   *    liftedArbDag: Arbitrary<LiftedPair<Passable, Lifted>>,
   *  }}
   */ (recursives);

  /**
   * A factory for arbitrary [unliftedKey, liftedKey] pairs.
   */
  const arbLiftedKey = liftedKeyDag.map(pair => harden(pair));

  /**
   * A factory for arbitrary [unliftedPassable, liftedPassable] pairs.
   */
  const arbLiftedPassable = liftedArbDag.map(pair => harden(pair));

  /**
   * A factory for arbitrary Keys.
   */
  const arbKey = arbLiftedKey.map(pair => pair[0]);

  /**
   * A factory for arbitrary Passables.
   */
  const arbPassable = arbLiftedPassable.map(pair => pair[0]);

  return {
    exampleAlice,
    exampleBob,
    exampleCarol,
    arbString,
    arbKeyLeaf,
    arbLeaf,
    arbKey,
    arbPassable,
    arbLiftedKey,
    arbLiftedPassable,
  };
};
