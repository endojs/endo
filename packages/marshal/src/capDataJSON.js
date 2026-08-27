// @ts-check

const { Fail } = assert;

/** @param {unknown} x */
const assertJSON = x => {
  assert.typeof(x, 'string');
  void JSON.parse(x);
};

/**
 * @param {import('./types').CapData<unknown>} capData - with "simple" slots;
 *   that is: slots whose JSON form has no occurrence of `:[`.
 * @returns {string}
 */
export const capDataToJSON = ({ body, slots }) => {
  assert(Array.isArray(slots));
  const slotj = JSON.stringify(slots);
  slotj.indexOf(':[') < 0 || Fail`expected simple slots`;
  const body1 = body.replace(/^#/, '');
  assertJSON(body1);
  const json = `{"$body":${body1},"slots":${slotj}}`;
  assertJSON(json);
  return json;
};

export const JSONToCapData = json => {
  assert.typeof(json, 'string');
  json.startsWith('{"$body":') || Fail`expected $body`;
  json.endsWith('}') || Fail`expected }`;
  const pos = json.lastIndexOf(':[');
  pos > 0 || Fail`expected slots`;
  const body = `#${json.slice('{"$body":'.length, pos - ',"slots"'.length)}`;
  const slotj = json.slice(pos + 1, -1);
  const slots = JSON.parse(slotj);
  Array.isArray(slots) || Fail`expected slots to be Array`;
  return { body, slots };
};
