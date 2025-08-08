/// <reference types="ses"/>

import { q, X, Fail } from '@endo/errors';
import { Nat } from '@endo/nat';
import {
  getErrorConstructor,
  isPrimitive,
  nameForPassableSymbol,
  passableSymbolForName,
} from '@endo/pass-style';
import { QCLASS } from './encodeToCapData.js';
import { makeMarshal } from './marshal.js';

/**
 * @import {Stringable} from 'ses';
 * @import {Passable} from '@endo/pass-style';
 * @import {Encoding} from './types.js';
 */

const { ownKeys } = Reflect;
const { isArray } = Array;
const { stringify: quote } = JSON;

/**
 * @typedef {object} Indenter
 * @property {(openBracket: string) => number} open
 * @property {() => number} line
 * @property {(token: string) => number} next
 * @property {(closeBracket: string) => number} close
 * @property {() => string} done
 */

/**
 * Generous whitespace for readability
 *
 * @returns {Indenter}
 */
const makeYesIndenter = () => {
  const strings = [];
  let level = 0;
  let needSpace = false;
  const line = () => {
    needSpace = false;
    return strings.push('\n', '  '.repeat(level));
  };
  return harden({
    open: openBracket => {
      level += 1;
      if (needSpace) {
        strings.push(' ');
      }
      needSpace = false;
      return strings.push(openBracket);
    },
    line,
    next: token => {
      if (needSpace && token !== ',' && token !== ')') {
        strings.push(' ');
      }
      needSpace = true;
      return strings.push(token);
    },
    close: closeBracket => {
      assert(level >= 1);
      level -= 1;
      line();
      return strings.push(closeBracket);
    },
    done: () => {
      assert.equal(level, 0);
      return strings.join('');
    },
  });
};

/**
 * If the last character of one token together with the first character
 * of the next token matches this pattern, then the two tokens must be
 * separated by whitespace to preserve their meaning. Otherwise the
 * whitespace in unnecessary.
 *
 * The `<!` and `->` cases prevent the accidental formation of an
 * html-like comment. I don't think the double angle brackets are actually
 * needed but I haven't thought about it enough to remove them.
 */
const badPairPattern = /^(?:\w\w|<<|>>|\+\+|--|<!|->)$/;

/**
 * Minimum whitespace needed to preseve meaning.
 *
 * @returns {Indenter}
 */
const makeNoIndenter = () => {
  /** @type {string[]} */
  const strings = [];
  return harden({
    open: openBracket => strings.push(openBracket),
    line: () => strings.length,
    next: token => {
      if (strings.length >= 1) {
        const last = strings[strings.length - 1];
        // eslint-disable-next-line @endo/restrict-comparison-operands -- error
        if (last.length >= 1 && token.length >= 1) {
          const pair = `${last[last.length - 1]}${token[0]}`;
          if (badPairPattern.test(pair)) {
            strings.push(' ');
          }
        }
      }
      return strings.push(token);
    },
    close: closeBracket => {
      if (strings.length >= 1 && strings[strings.length - 1] === ',') {
        strings.pop();
      }
      return strings.push(closeBracket);
    },
    done: () => strings.join(''),
  });
};

const identPattern = /^[a-zA-Z]\w*$/;
harden(identPattern);
const AtAtPrefixPattern = /^@@(.*)$/;
harden(AtAtPrefixPattern);

/**
 * @param {Encoding} encoding
 * @param {boolean=} shouldIndent
 * @param {any[]} [slots]
 * @returns {string}
 */
const decodeToJustin = (encoding, shouldIndent = false, slots = []) => {
  /**
   * The first pass does some input validation.
   * Its control flow should mirror `recur` as closely as possible
   * and the two should be maintained together. They must visit everything
   * in the same order.
   *
   * TODO now that ibids are gone, we should fold this back together into
   * one validating pass.
   *
   * @param {Encoding} rawTree
   * @returns {void}
   */
  const prepare = rawTree => {
    if (isPrimitive(rawTree)) {
      return;
    }
    // Assertions of the above to narrow the type.
    assert.typeof(rawTree, 'object');
    assert(rawTree !== null);
    if (QCLASS in rawTree) {
      const qclass = rawTree[QCLASS];
      typeof qclass === 'string' ||
        Fail`invalid qclass typeof ${q(typeof qclass)}`;
      assert(!isArray(rawTree));
      switch (rawTree['@qclass']) {
        case 'undefined':
        case 'NaN':
        case 'Infinity':
        case '-Infinity': {
          return;
        }
        case 'bigint': {
          const { digits } = rawTree;
          typeof digits === 'string' ||
            Fail`invalid digits typeof ${q(typeof digits)}`;
          return;
        }
        case '@@asyncIterator': {
          return;
        }
        case 'symbol': {
          const { name } = rawTree;
          assert.typeof(name, 'string');
          const sym = passableSymbolForName(name);
          assert.typeof(sym, 'symbol');
          return;
        }
        case 'tagged': {
          const { tag, payload } = rawTree;
          assert.typeof(tag, 'string');
          prepare(payload);
          return;
        }
        case 'slot': {
          const { index, iface } = rawTree;
          assert.typeof(index, 'number');
          Nat(index);
          if (iface !== undefined) {
            assert.typeof(iface, 'string');
          }
          return;
        }
        case 'hilbert': {
          const { original, rest } = rawTree;
          'original' in rawTree ||
            Fail`Invalid Hilbert Hotel encoding ${rawTree}`;
          prepare(original);
          if ('rest' in rawTree) {
            if (typeof rest !== 'object') {
              throw Fail`Rest ${rest} encoding must be an object`;
            }
            if (rest === null) {
              throw Fail`Rest ${rest} encoding must not be null`;
            }
            if (isArray(rest)) {
              throw Fail`Rest ${rest} encoding must not be an array`;
            }
            if (QCLASS in rest) {
              throw Fail`Rest encoding ${rest} must not contain ${q(QCLASS)}`;
            }
            const names = ownKeys(rest);
            for (const name of names) {
              typeof name === 'string' ||
                Fail`Property name ${name} of ${rawTree} must be a string`;
              prepare(rest[name]);
            }
          }
          return;
        }
        case 'error': {
          const { name, message } = rawTree;
          if (typeof name !== 'string') {
            throw Fail`invalid error name typeof ${q(typeof name)}`;
          }
          getErrorConstructor(name) !== undefined ||
            Fail`Must be the name of an Error constructor ${name}`;
          typeof message === 'string' ||
            Fail`invalid error message typeof ${q(typeof message)}`;
          return;
        }

        default: {
          assert.fail(X`unrecognized ${q(QCLASS)} ${q(qclass)}`, TypeError);
        }
      }
    } else if (isArray(rawTree)) {
      const { length } = rawTree;
      for (let i = 0; i < length; i += 1) {
        prepare(rawTree[i]);
      }
    } else {
      const names = ownKeys(rawTree);
      for (const name of names) {
        if (typeof name !== 'string') {
          throw Fail`Property name ${name} of ${rawTree} must be a string`;
        }
        prepare(rawTree[name]);
      }
    }
  };

  const makeIndenter = shouldIndent ? makeYesIndenter : makeNoIndenter;
  let out = makeIndenter();

  /**
   * This is the second pass recursion after the first pass `prepare`.
   * The first pass did some input validation so
   * here we can safely assume everything those things are validated.
   *
   * @param {Encoding} rawTree
   * @returns {number}
   */
  const decode = rawTree => {
    // eslint-disable-next-line no-use-before-define
    return recur(rawTree);
  };

  const decodeProperty = (name, value) => {
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
      out.next(`${quote(name)}:`);
    }
    decode(value);
    out.next(',');
  };

  /**
   * Modeled after `fullRevive` in marshal.js
   *
   * @param {Encoding} rawTree
   * @returns {number}
   */
  const recur = rawTree => {
    if (isPrimitive(rawTree)) {
      // primitives get quoted
      return out.next(quote(rawTree));
    }
    // Assertions of the above to narrow the type.
    assert.typeof(rawTree, 'object');
    assert(rawTree !== null);
    if (QCLASS in rawTree) {
      const qclass = rawTree[QCLASS];
      assert.typeof(qclass, 'string');
      assert(!isArray(rawTree));
      // Switching on `encoded[QCLASS]` (or anything less direct, like
      // `qclass`) does not discriminate rawTree in typescript@4.2.3 and
      // earlier.
      switch (rawTree['@qclass']) {
        // Encoding of primitives not handled by JSON
        case 'undefined':
        case 'NaN':
        case 'Infinity':
        case '-Infinity': {
          // Their qclass is their expression source.
          return out.next(qclass);
        }
        case 'bigint': {
          const { digits } = rawTree;
          assert.typeof(digits, 'string');
          return out.next(`${BigInt(digits)}n`);
        }
        case '@@asyncIterator': {
          // TODO deprecated. Eventually remove.
          return out.next('Symbol.asyncIterator');
        }
        case 'symbol': {
          const { name } = rawTree;
          assert.typeof(name, 'string');
          const sym = passableSymbolForName(name);
          assert.typeof(sym, 'symbol');
          const registeredName = nameForPassableSymbol(sym);
          if (registeredName === undefined) {
            const match = AtAtPrefixPattern.exec(name);
            assert(match !== null);
            const suffix = match[1];
            assert(Symbol[suffix] === sym);
            assert(identPattern.test(suffix));
            return out.next(`Symbol.${suffix}`);
          }
          return out.next(`passableSymbolForName(${quote(registeredName)})`);
        }
        case 'tagged': {
          const { tag, payload } = rawTree;
          out.next(`makeTagged(${quote(tag)}`);
          out.next(',');
          decode(payload);
          return out.next(')');
        }

        case 'slot': {
          const { iface } = rawTree;
          const index = Number(Nat(rawTree.index));
          const nestedRender = arg => {
            const oldOut = out;
            try {
              out = makeNoIndenter();
              decode(arg);
              return out.done();
            } finally {
              out = oldOut;
            }
          };
          if (index < slots.length) {
            const renderedSlot = nestedRender(slots[index]);
            return iface === undefined
              ? out.next(`slotToVal(${renderedSlot})`)
              : out.next(`slotToVal(${renderedSlot},${nestedRender(iface)})`);
          }
          return iface === undefined
            ? out.next(`slot(${index})`)
            : out.next(`slot(${index},${nestedRender(iface)})`);
        }

        case 'hilbert': {
          const { original, rest } = rawTree;
          out.open('{');
          decodeProperty(QCLASS, original);
          if ('rest' in rawTree) {
            assert.typeof(rest, 'object');
            assert(rest !== null);
            const names = ownKeys(rest);
            for (const name of names) {
              if (typeof name !== 'string') {
                throw Fail`Property name ${q(
                  name,
                )} of ${rest} must be a string`;
              }
              decodeProperty(name, rest[name]);
            }
          }
          return out.close('}');
        }

        case 'error': {
          const {
            name,
            message,
            cause = undefined,
            errors = undefined,
          } = rawTree;
          cause === undefined ||
            Fail`error cause not yet implemented in marshal-justin`;
          name !== `AggregateError` ||
            Fail`AggregateError not yet implemented in marshal-justin`;
          errors === undefined ||
            Fail`error errors not yet implemented in marshal-justin`;
          return out.next(`${name}(${quote(message)})`);
        }

        default: {
          throw assert.fail(
            X`unrecognized ${q(QCLASS)} ${q(qclass)}`,
            TypeError,
          );
        }
      }
    } else if (isArray(rawTree)) {
      const { length } = rawTree;
      if (length === 0) {
        return out.next('[]');
      } else {
        out.open('[');
        for (let i = 0; i < length; i += 1) {
          out.line();
          decode(rawTree[i]);
          out.next(',');
        }
        return out.close(']');
      }
    } else {
      // rawTree is an `EncodingRecord` which only has string keys,
      // but since ownKeys is not generic, it can't propagate that
      const names = /** @type {string[]} */ (ownKeys(rawTree));
      if (names.length === 0) {
        return out.next('{}');
      } else {
        out.open('{');
        for (const name of names) {
          decodeProperty(name, rawTree[name]);
        }
        return out.close('}');
      }
    }
  };
  prepare(encoding);
  decode(encoding);
  return out.done();
};
harden(decodeToJustin);
export { decodeToJustin };

/**
 * @param {Passable} passable
 * @param {boolean} [shouldIndent]
 * @returns {string}
 */
export const passableAsJustin = (passable, shouldIndent = true) => {
  let slotCount = 0;
  // Using post-increment below only so that the indexes start at zero
  // and the `slotCount` variable can be initialized to `0` rather than
  // `-1`.
  // eslint-disable-next-line no-plusplus
  const convertValToSlot = val => `s${slotCount++}`;
  const { toCapData } = makeMarshal(convertValToSlot);
  const { body, slots } = toCapData(passable);
  const encoded = JSON.parse(body);
  return decodeToJustin(encoded, shouldIndent, slots);
};
harden(passableAsJustin);

// The example below is the `patt1` test case from `qp-on-pattern.test.js`.
// Please co-maintain the following doc-comment and that test module.
/**
 * `qp` for quote passable as a quasi-quoted Justin expression.
 *
 * Both `q` from `@endo/errors` and this `qp` from `@endo/marshal` can
 * be used together with `Fail`, `X`, etc from `@endo/errors` to mark
 * a substitution value to be both
 * - visually quoted in some useful manner
 * - unredacted
 *
 * Differences:
 * - given a pattern `M.and(M.gte(-100), M.lte(100))`,
 *   ```js
 *   `${q(patt)}`
 *   ```
 *   produces `"[match:and]"`, whereas
 *   ```js
 *   `${qp(patt)}`
 *   ```
 *   produces quasi-quotes Justin of what would be passed:
 *   ```js
 *   `makeTagged("match:and", [
 *     makeTagged("match:gte", -100),
 *     makeTagged("match:lte", 100),
 *   ])`
 *   ```
 * - `q` is lazy, minimizing the cost for using it in an error that's never
 *   logged. Unfortunately, due to layering constraints, `qp` is not
 *   lazy, always rendering to quasi-quoted Justin immediately.
 *
 * Since Justin is a subset of HardenedJS, neither the name `qp` nor the
 * rendered form need to make clear that the rendered form is in Justin rather
 * than HardenedJS.
 *
 * @param {Passable} payload
 * @returns {Stringable}
 */
export const qp = payload => `\`${passableAsJustin(harden(payload), true)}\``;
harden(qp);
