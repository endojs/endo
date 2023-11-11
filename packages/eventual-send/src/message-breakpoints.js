import { getEnvironmentOption } from '@endo/env-options';

const { quote: q, Fail } = assert;

const { hasOwn, freeze, entries } = Object;

/**
 * This is the external JSON representation, in which
 * - the outer property name is the class-like tag or '*',
 * - the inner property name is the method name or '*',
 * - the value is a non-negative integer countdown or '*'.
 *
 * @typedef {Record<string, Record<string, number | '*'>>} MessageBreakpoints
 */

/**
 * This is the internal JSON representation, in which
 * - the outer property name is the method name or '*',
 * - the inner property name is the class-like tag or '*',
 * - the value is a non-negative integer countdown or '*'.
 *
 * @typedef {Record<string, Record<string, number | '*'>>} BreakpointTable
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
    if (methodName === undefined) {
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
