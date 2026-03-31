const blanks = /^(?:\s|\u2028|\u2029)$/;
const syntax = '^$\\.*+?()[]{}|';
const punctuation = ',-=<>#&!%:;@~\'`"';

const special = {
  __proto__: null,
  '\t': 't',
  '\n': 'n',
  '\v': 'v',
  '\f': 'f',
  '\r': 'r',
};

/** @param {number} codePoint */
const isHighSurrogate = codePoint => codePoint >= 0xd800 && codePoint <= 0xdbff;
/** @param {number} codePoint */
const isLowSurrogate = codePoint => codePoint >= 0xdc00 && codePoint <= 0xdfff;

/** @param {string} character */
const escapeCharacter = character => {
  if (syntax.indexOf(character) >= 0 || character === '\u002F') {
    return `\\${character}`;
  }
  if (character in special) {
    return `\\${special[character]}`;
  }
  const codePoint = /** @type {number} */ (character.codePointAt(0));
  if (
    punctuation.indexOf(character) >= 0 ||
    blanks.test(character) ||
    isLowSurrogate(codePoint) ||
    isHighSurrogate(codePoint)
  ) {
    if (codePoint < 255) {
      return `\\x${codePoint.toString(16).padStart(2, '0')}`;
    } else {
      return `\\u${codePoint.toString(16).padStart(4, '0')}`;
    }
  }
  return character;
};

/** @param {string} verbatimString */
const jsEscapeRegExp = verbatimString => {
  // Although JavaScript strings are indexed by code unit, a string iterator
  // visits code points.
  const characters = verbatimString[Symbol.iterator]();
  let re = '';
  // The most economical way to induce the iterator protocol to consume exactly
  // the first character is to use a for loop and break.
  // I don't make the rules.
  // eslint-disable-next-line no-unreachable-loop
  for (const character of characters) {
    if (
      (character >= '0' && character <= '9') ||
      (character >= 'A' && character <= 'Z') ||
      (character >= 'a' && character <= 'z')
    ) {
      const codePoint = /** @type {number} */ (character.codePointAt(0));
      re += `\\x${codePoint.toString(16).padStart(2, '0')}`;
    } else {
      re += escapeCharacter(character);
    }
    break;
  }
  for (const character of characters) {
    re += escapeCharacter(character);
  }
  return re;
};

const nativeEscapeRegExp = /** @type {(string: string) => string} */ (
  // @ts-expect-error
  RegExp.escape
);

/** @type {(string: string) => string} */
export const escapeRegExp = nativeEscapeRegExp || jsEscapeRegExp;
