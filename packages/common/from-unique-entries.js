import { q, Fail } from '@endo/errors';

const { fromEntries } = Object;
const { ownKeys } = Reflect;

/**
 * Throws if multiple entries use the same property name. Otherwise acts
 * like `Object.fromEntries` but hardens the result.
 * Use it to protect from property names computed from user-provided data.
 *
 * @template [T=any]
 * @param {Iterable<readonly [PropertyKey, T]>} allEntries
 * @returns {{ [k: string]: T; }}
 */
export const fromUniqueEntries = allEntries => {
  const entriesArray = [...allEntries];
  const result = harden(fromEntries(entriesArray));
  if (ownKeys(result).length === entriesArray.length) {
    return result;
  }
  const names = new Set();
  for (const [name, _] of entriesArray) {
    if (names.has(name)) {
      Fail`collision on property name ${q(name)}: ${entriesArray}`;
    }
    names.add(name);
  }
  throw Fail`internal: failed to create object from unique entries`;
};
harden(fromUniqueEntries);
