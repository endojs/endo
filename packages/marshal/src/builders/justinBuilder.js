/// <reference types="ses"/>

import { Far, getInterfaceOf, nameForPassableSymbol } from '@endo/pass-style';
import {
  identPattern,
  AtAtPrefixPattern,
  makeNoIndenter,
  makeYesIndenter,
} from '../marshal-justin.js';

const { stringify } = JSON;
const { Fail, quote: q } = assert;
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

    buildUndefined: () => out.next('undefined'),
    buildNull: () => out.next('null'),
    buildBoolean: outNextJSON,
    buildNumber: num => {
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
    buildBigint: bigint => out.next(`${bigint}n`),
    buildString: outNextJSON,
    buildSymbol: sym => {
      assert.typeof(sym, 'symbol');
      const name = nameForPassableSymbol(sym);
      if (name === undefined) {
        throw Fail`Symbol must be either registered or well known: ${q(sym)}`;
      }
      const registeredName = Symbol.keyFor(sym);
      if (registeredName === undefined) {
        const match = AtAtPrefixPattern.exec(name);
        assert(match !== null);
        const suffix = match[1];
        assert(Symbol[suffix] === sym);
        assert(identPattern.test(suffix));
        return out.next(`Symbol.${suffix}`);
      }
      return out.next(`Symbol.for(${stringify(registeredName)})`);
    },

    buildRecord: (names, buildValuesIter) => {
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
    buildArray: (count, buildElementsIter) => {
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

    buildError: error => out.next(`${error.name}(${stringify(error.message)})`),
    buildRemotable: remotable => {
      slotIndex += 1;
      return out.next(
        `slot(${slotIndex},${stringify(getInterfaceOf(remotable))})`,
      );
    },
    buildPromise: _promise => {
      slotIndex += 1;
      return out.next(`slot(${slotIndex})`);
    },
  });
  return justinBuilder;
};
harden(makeJustinBuilder);

export const makeBuilder = () => makeJustinBuilder();
harden(makeBuilder);
