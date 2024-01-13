import { getEnvironmentOption } from '@endo/env-options';

const { quote: q, Fail } = assert;

const { hasOwn, freeze, entries } = Object;

/**
 * @typedef {string | '*'} MatchStringTag
 *   A star `'*'` matches any recipient. Otherwise, the string is
 *   matched against the value of a recipient's` @@toStringTag`
 *   after stripping out any leading `'Alleged: '` or `'DebugName: '`
 *   prefix. For objects defined with `Far` this is the first argument,
 *   known as the `farName`. For exos, this is the tag.
 */
/**
 * @typedef {string | '*'} MatchMethodName
 *   A star `'*'` matches any method name. Otherwise, the string is
 *   matched against the method name. Currently, this is only an exact match.
 *   However, beware that we may introduce a string syntax for
 *   symbol method names.
 */
/**
 * @typedef {number | '*'} MatchCountdown
 *   A star `'*'` will always breakpoint. Otherwise, the string
 *   must be a non-negative integer. Once zero, that always breakpoint.
 *   Otherwise decrement by one each time it matches until it reaches zero.
 *   In other words, the countdown represents the number of
 *   breakpoint occurrences to skip before actually breakpointing.
 */

/**
 * This is the external JSON representation, in which
 * - the outer property name is the class-like tag or '*',
 * - the inner property name is the method name or '*',
 * - the value is a non-negative integer countdown or '*'.
 *
 * @typedef {Record<MatchStringTag, Record<MatchMethodName, MatchCountdown>>} MessageBreakpoints
 */

/**
 * This is the internal JSON representation, in which
 * - the outer property name is the method name or '*',
 * - the inner property name is the class-like tag or '*',
 * - the value is a non-negative integer countdown or '*'.
 *
 * @typedef {Record<MatchMethodName, Record<MatchStringTag, MatchCountdown>>} BreakpointTable
 */

/**
 * @typedef {object} MessageBreakpointTester
 * @property {() => MessageBreakpoints} getBreakpoints
 * @property {(newBreakpoints?: MessageBreakpoints) => void} setBreakpoints
 * @property {(
 *   recipient: object,
 *   methodName: string | symbol | undefined
 * ) => boolean} shouldBreakpoint
 */

/**
 * @param {any} val
 * @returns {val is Record<string, any>}
 */
const isJSONRecord = val =>
  typeof val === 'object' && val !== null && !Array.isArray(val);

/**
 * Return `tag` after stripping off any `'Alleged: '` or `'DebugName: '`
 * prefix if present.
 * ```js
 * simplifyTag('Alleged: moola issuer') === 'moola issuer'
 * ```
 * If there are multiple such prefixes, only the outer one is removed.
 *
 * @param {string} tag
 * @returns {string}
 */
const simplifyTag = tag => {
  for (const prefix of ['Alleged: ', 'DebugName: ']) {
    if (tag.startsWith(prefix)) {
      return tag.slice(prefix.length);
    }
  }
  return tag;
};

/**
 * @param {string} optionName
 * @returns {MessageBreakpointTester | undefined}
 */
export const makeMessageBreakpointTester = optionName => {
  let breakpoints = JSON.parse(getEnvironmentOption(optionName, 'null'));

  if (breakpoints === null) {
    return undefined;
  }

  /** @type {BreakpointTable} */
  let breakpointsTable;

  const getBreakpoints = () => breakpoints;
  freeze(getBreakpoints);

  const setBreakpoints = (newBreakpoints = breakpoints) => {
    isJSONRecord(newBreakpoints) ||
      Fail`Expected ${q(optionName)} option to be a JSON breakpoints record`;

    /** @type {BreakpointTable} */
    // @ts-expect-error confused by __proto__
    const newBreakpointsTable = { __proto__: null };

    for (const [tag, methodBPs] of entries(newBreakpoints)) {
      tag === simplifyTag(tag) ||
        Fail`Just use simple tag ${q(simplifyTag(tag))} rather than ${q(tag)}`;
      isJSONRecord(methodBPs) ||
        Fail`Expected ${q(optionName)} option's ${q(
          tag,
        )} to be a JSON methods breakpoints record`;
      for (const [methodName, count] of entries(methodBPs)) {
        count === '*' ||
          (typeof count === 'number' &&
            Number.isSafeInteger(count) &&
            count >= 0) ||
          Fail`Expected ${q(optionName)} option's ${q(tag)}.${q(
            methodName,
          )} to be "*" or a non-negative integer`;

        const classBPs = hasOwn(newBreakpointsTable, methodName)
          ? newBreakpointsTable[methodName]
          : (newBreakpointsTable[methodName] = {
              // @ts-expect-error confused by __proto__
              __proto__: null,
            });
        classBPs[tag] = count;
      }
    }
    breakpoints = newBreakpoints;
    breakpointsTable = newBreakpointsTable;
  };
  freeze(setBreakpoints);

  const shouldBreakpoint = (recipient, methodName) => {
    if (methodName === undefined || methodName === null) {
      // TODO enable function breakpointing
      return false;
    }
    const classBPs = breakpointsTable[methodName] || breakpointsTable['*'];
    if (classBPs === undefined) {
      return false;
    }
    let tag = simplifyTag(recipient[Symbol.toStringTag]);
    let count = classBPs[tag];
    if (count === undefined) {
      tag = '*';
      count = classBPs[tag];
      if (count === undefined) {
        return false;
      }
    }
    if (count === '*') {
      return true;
    }
    if (count === 0) {
      return true;
    }
    assert(typeof count === 'number' && count >= 1);
    classBPs[tag] = count - 1;
    return false;
  };
  freeze(shouldBreakpoint);

  const breakpointTester = freeze({
    getBreakpoints,
    setBreakpoints,
    shouldBreakpoint,
  });
  breakpointTester.setBreakpoints();
  return breakpointTester;
};
freeze(makeMessageBreakpointTester);
