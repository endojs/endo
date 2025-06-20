import {
  Far,
  getTag,
  makeTagged,
  mapIterable,
  passStyleOf,
} from '@endo/pass-style';

/**
 * @import {Passable} from '@endo/pass-style';
 * @import {Builder} from './builder-types.js';
 */

const { fromEntries } = Object;
const { ownKeys } = Reflect;
const { quote: q, details: X } = assert;

const makeSubgraphBuilder = () => {
  const ident = val => val;

  /** @type {Builder<Passable,Passable>} */
  const subgraphBuilder = Far('SubgraphBuilder', {
    buildRoot: buildTopFn => buildTopFn(),

    // Atoms
    buildUndefined: () => undefined,
    buildNull: () => null,
    buildBoolean: ident,
    buildInteger: ident,
    buildFloat64: ident,
    buildString: ident,
    buildByteArray: ident,
    buildSymbol: ident,

    // Containers
    buildStruct: (names, buildValuesIter) => {
      const builtValues = [...buildValuesIter];
      assert(names.length === builtValues.length);
      const builtEntries = names.map((name, i) => [name, builtValues[i]]);
      return harden(fromEntries(builtEntries));
    },
    buildList: (_count, buildElementsIter) => harden([...buildElementsIter]),
    buildTagged: (tagName, buildPayloadFn) =>
      makeTagged(tagName, buildPayloadFn()),

    // References
    buildTarget: ident,
    buildPromise: ident,

    // Errors
    buildError: ident,
  });
  return subgraphBuilder;
};
harden(makeSubgraphBuilder);

const makeSubgraphRecognizer = () => {
  /**
   * @param {any} passable
   * @param {Builder<Passable,Passable>} builder
   * @returns {Passable}
   */
  const recognizeNode = (passable, builder) => {
    // First we handle all primitives. Some can be represented directly as
    // JSON, and some must be encoded into smallcaps strings.
    const passStyle = passStyleOf(passable);
    switch (passStyle) {
      case 'null': {
        return builder.buildNull();
      }
      case 'boolean': {
        return builder.buildBoolean(passable);
      }
      case 'string': {
        return builder.buildString(passable);
      }
      case 'undefined': {
        return builder.buildUndefined();
      }
      case 'number': {
        return builder.buildFloat64(passable);
      }
      case 'bigint': {
        return builder.buildInteger(passable);
      }
      case 'symbol': {
        return builder.buildSymbol(passable);
      }
      case 'copyRecord': {
        const names = /** @type {string[]} */ (ownKeys(passable)).sort();
        const buildValuesIter = mapIterable(names, name =>
          recognizeNode(passable[name], builder),
        );
        return builder.buildStruct(names, buildValuesIter);
      }
      case 'copyArray': {
        const buildElementsIter = mapIterable(passable, el =>
          recognizeNode(el, builder),
        );
        return builder.buildList(passable.length, buildElementsIter);
      }
      case 'tagged': {
        const buildPayloadFn = () => recognizeNode(passable.payload, builder);
        return builder.buildTagged(getTag(passable), buildPayloadFn);
      }
      case 'remotable': {
        return builder.buildTarget(passable);
      }
      case 'promise': {
        return builder.buildPromise(passable);
      }
      case 'error': {
        return builder.buildError(passable);
      }
      default: {
        throw assert.fail(
          X`internal: Unrecognized passStyle ${q(passStyle)}`,
          TypeError,
        );
      }
    }
  };
  /**
   * @param {Passable} passable
   * @param {Builder<Passable,Passable>} builder
   * @returns {Passable}
   */
  const recognizeSubgraph = (passable, builder) =>
    builder.buildRoot(() => recognizeNode(passable, builder));
  return harden(recognizeSubgraph);
};
harden(makeSubgraphRecognizer);

export {
  makeSubgraphBuilder as makeBuilder,
  makeSubgraphRecognizer as makeRecognizer,
};
