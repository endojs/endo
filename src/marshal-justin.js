// @ts-check

// eslint-disable-next-line spaced-comment
/// <reference types="ses"/>

import { Nat } from '@agoric/nat';
import { assert, details as X, q } from '@agoric/assert';
import { QCLASS, getErrorConstructor } from './marshal';
// import { makeReviverIbidTable } from './ibidTables';

import './types';

const { ownKeys } = Reflect;

const { stringify: quote } = JSON;

/**
 * @typedef {Object} Indenter
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
  const line = () => strings.push('\n', '  '.repeat(level));
  return harden({
    open: openBracket => {
      assert(level >= 1);
      level += 1;
      return strings.push(' ', openBracket);
    },
    line,
    next: token => strings.push(' ', token),
    close: closeBracket => {
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
  const strings = [];
  return harden({
    open: openBracket => strings.push(openBracket),
    line: () => strings.length,
    next: token => {
      if (strings.length >= 1) {
        const last = strings[strings.length - 1];
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

const registerIbid = _rawTree => {
  // doesn't do anything yet.
};

const startIbid = _rawTree => {
  // doesn't do anything yet.
};

const finishIbid = _rawTree => {
  // doesn't do anything yet.
};

const identPattern = /^[a-zA-Z]\w*$/;

/**
 * @param {Encoding} encoding
 * @param {CyclePolicy} _cyclePolicy
 * @param {boolean=} shouldIndent
 * @returns {string}
 */
const decodeToJustin = (encoding, _cyclePolicy, shouldIndent = false) => {
  // const ibidTable = makeReviverIbidTable(cyclePolicy);
  const makeIndenter = shouldIndent ? makeYesIndenter : makeNoIndenter;
  const out = makeIndenter();

  const decodeProperty = (name, value) => {
    out.line();
    assert.typeof(name, 'string', X`Property name ${name} of must be a string`);
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
    // eslint-disable-next-line no-use-before-define
    recur(value);
    out.next(',');
  };

  /**
   * Modeled after `fullRevive` in marshal.js
   *
   * @param {Encoding} rawTree
   * @returns {number}
   */
  const recur = rawTree => {
    if (Object(rawTree) !== rawTree) {
      // primitives get quoted
      return out.next(quote(rawTree));
    }
    // Assertions of the above to narrow the type.
    assert.typeof(rawTree, 'object');
    assert(rawTree !== null);
    if (QCLASS in rawTree) {
      const qclass = rawTree[QCLASS];
      assert.typeof(
        qclass,
        'string',
        X`invalid qclass typeof ${q(typeof qclass)}`,
      );
      assert(!Array.isArray(rawTree));
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
          assert.typeof(
            digits,
            'string',
            X`invalid digits typeof ${q(typeof digits)}`,
          );
          return out.next(`${BigInt(digits)}n`);
        }
        case '@@asyncIterator': {
          return out.next('Symbol.asyncIterator');
        }

        case 'ibid': {
          const { index } = rawTree;
          return out.next(`getIbid(${index})`);
        }

        case 'error': {
          registerIbid(rawTree);
          const { name, message } = rawTree;
          assert.typeof(
            name,
            'string',
            X`invalid error name typeof ${q(typeof name)}`,
          );
          assert(
            getErrorConstructor(name) !== undefined,
            X`Must be the name of an Error constructor ${name}`,
          );
          assert.typeof(
            message,
            'string',
            X`invalid error message typeof ${q(typeof message)}`,
          );
          return out.next(`${name}(${quote(message)})`);
        }

        case 'slot': {
          registerIbid(rawTree);
          let { index, iface } = rawTree;
          index = Number(Nat(index));
          assert.typeof(iface, 'string');
          iface = quote(iface);
          return out.next(`getSlotVal(${index},${iface})`);
        }

        case 'hilbert': {
          startIbid(rawTree);
          const { original, rest } = rawTree;
          assert(
            'original' in rawTree,
            X`Invalid Hilbert Hotel encoding ${rawTree}`,
          );
          out.open('{');
          decodeProperty(QCLASS, original);
          if ('rest' in rawTree) {
            assert.typeof(
              rest,
              'object',
              X`Rest ${rest} encoding must be an object`,
            );
            assert(rest !== null, X`Rest ${rest} encoding must not be null`);
            assert(
              !Array.isArray(rest),
              X`Rest ${rest} encoding must not be an array`,
            );
            assert(
              !(QCLASS in rest),
              X`Rest encoding ${rest} must not contain ${q(QCLASS)}`,
            );
            startIbid(rest);
            const names = ownKeys(rest);
            for (const name of names) {
              decodeProperty(name, rest[name]);
            }
            finishIbid(rest);
          }
          finishIbid(rawTree);
          return out.close('}');
        }

        default: {
          assert.fail(X`unrecognized ${q(QCLASS)} ${q(qclass)}`, TypeError);
        }
      }
    } else if (Array.isArray(rawTree)) {
      startIbid(rawTree);
      const { length } = rawTree;
      if (length === 0) {
        finishIbid(rawTree);
        return out.next('[]');
      } else {
        out.open('[');
        for (let i = 0; i < length; i += 1) {
          out.line();
          recur(rawTree[i]);
          out.next(',');
        }
        finishIbid(rawTree);
        return out.close(']');
      }
    } else {
      startIbid(rawTree);
      const names = ownKeys(rawTree);
      if (names.length === 0) {
        finishIbid(rawTree);
        return out.next('{}');
      } else {
        out.open('{');
        for (const name of names) {
          decodeProperty(name, rawTree[name]);
        }
        finishIbid(rawTree);
        return out.close('}');
      }
    }
  };
  recur(encoding);
  return out.done();
};
harden(decodeToJustin);
export { decodeToJustin };
