import { Fail } from '@endo/errors';
import { Far, getInterfaceOf, nameForPassableSymbol } from '@endo/pass-style';
import {
  identPattern,
  makeNoIndenter,
  makeYesIndenter,
} from '../marshal-justin.js';

/**
 * @import {Builder} from './builder-types.js';
 */

const { stringify } = JSON;
const { is } = Object;

export const makeJustinBuilder = (shouldIndent = false, _slots = []) => {
  let out;
  let slotIndex;
  const outNextJSON = val => out.next(stringify(val));

  /** @type {Builder<number,string>} */
  const justinBuilder = Far('JustinBuilder', {
    buildRoot: buildTopFn => {
      const makeIndenter = shouldIndent ? makeYesIndenter : makeNoIndenter;
      out = makeIndenter();
      slotIndex = -1;
      buildTopFn();
      return out.done();
    },

    // Atoms
    buildUndefined: () => out.next('undefined'),
    buildNull: () => out.next('null'),
    buildBoolean: outNextJSON,
    buildInteger: bigint => out.next(`${bigint}n`),
    buildFloat64: num => {
      if (num === Infinity) {
        return out.next('Infinity');
      } else if (num === -Infinity) {
        return out.next('-Infinity');
      } else if (is(num, NaN)) {
        return out.next('NaN');
      } else {
        return out.next(stringify(num));
      }
    },
    buildString: outNextJSON,
    buildByteArray: byteArray => {
      Fail`ByteArray as Justin not yet implemented`;
      // Actually dead code, but TS does not seem to know that.
      return 33;
    },
    buildSymbol: sym => {
      assert.typeof(sym, 'symbol');
      const name = nameForPassableSymbol(sym);
      return out.next(`passableSymbolForName(${stringify(name)})`);
    },

    // Containers
    buildStruct: (names, buildValuesIter) => {
      if (names.length === 0) {
        return out.next('{}');
      }
      out.open('{');
      const iter = buildValuesIter[Symbol.iterator]();
      for (const name of names) {
        out.line();
        if (name === '__proto__') {
          // JavaScript interprets `{__proto__: x, ...}`
          // as making an object inheriting from `x`, whereas
          // in JSON it is simply a property name. Preserve the
          // JSON meaning.
          out.next(`["__proto__"]:`);
        } else if (identPattern.test(name)) {
          out.next(`${name}:`);
        } else {
          out.next(`${stringify(name)}:`);
        }
        const { value: _, done } = iter.next();
        if (done) {
          break;
        }
        out.next(',');
      }
      return out.close('}');
    },
    buildList: (count, buildElementsIter) => {
      if (count === 0) {
        return out.next('[]');
      }
      out.open('[');
      const iter = buildElementsIter[Symbol.iterator]();
      for (let i = 0; ; i += 1) {
        if (i < count) {
          out.line();
        }
        const { value: _, done } = iter.next();
        if (done) {
          break;
        }
        out.next(',');
      }
      return out.close(']');
    },
    buildTagged: (tagName, buildPayloadFn) => {
      out.next(`makeTagged(${stringify(tagName)},`);
      buildPayloadFn();
      return out.next(')');
    },

    // References
    buildTarget: remotable => {
      slotIndex += 1;
      return out.next(
        `slot(${slotIndex},${stringify(getInterfaceOf(remotable))})`,
      );
    },
    buildPromise: _promise => {
      slotIndex += 1;
      return out.next(`slot(${slotIndex})`);
    },

    // Errors
    buildError: error => out.next(`${error.name}(${stringify(error.message)})`),
  });
  return justinBuilder;
};
harden(makeJustinBuilder);

export const makeBuilder = () => makeJustinBuilder();
harden(makeBuilder);
