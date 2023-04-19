/** @template S @typedef {import('./types.js').CapData<S>} CapData */

const { Fail, quote: q } = assert;

/** @typedef {string} SimpleString */

/**
 * A SimpleString is one where JSON.strigify-ing the string just
 * puts quotes around the contents, and it contains no close square
 * brackets. Many slot encodings use slot strings that
 * obey these rules, which is why they are useful.
 *
 * @param {unknown} str
 * @returns {asserts str is SimpleString}
 */
export const assertSimpleString = str => {
  assert(typeof str === 'string');
  const stringified = JSON.stringify(str);
  const expected = `"${str}"`;
  stringified === expected ||
    Fail`Expected to stringify to ${q(expected)}, not ${q(stringified)}}`
  assert(str.indexOf(']') === -1);
};
harden(assertSimpleString);

/**
 * @param {CapData<SimpleString>} capData
 * @returns {string}
 */
export const stringifyCapData = capData => {
  const { body, slots: [...slots] } = capData;
  assert(typeof body === 'string');
  assert(body.startsWith('#'));
  const scBody = body.slice(1);
  JSON.parse(scBody); // Just asserts that it parses as JSON
  slots.forEach(assertSimpleString);
  return `{"slots":${JSON.stringify(slots)},"#body":${scBody}}`;
}
harden(stringifyCapData);

const DSL = /^\{"slots":(\[[^\]]*\]),"#body":(.*)\}$/;

export const parseCapData = str => {
  assert(typeof str === 'string');
  const matches = DSL.exec(str);
  assert(matches && matches.length === 3);
  const slots = JSON.parse(matches[1]);
  slots.forEach(assertSimpleString);
  const scBody = matches[2];
  JSON.parse(scBody); // Just asserts that it parses as JSON
  const body = `#${scBody}`;
  return harden({ body, slots });
};
harden(parseCapData);
