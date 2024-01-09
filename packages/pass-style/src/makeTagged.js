/// <reference types="ses"/>

import { Fail } from '@endo/errors';
import { PASS_STYLE } from './passStyle-helpers.js';
import { assertPassable } from './passStyleOf.js';

const { create, prototype: objectPrototype } = Object;

/**
 * @template {string} T
 * @template {any} P
 * @param {T} tag
 * @param {P} payload
 * @returns {import('./types.js').CopyTagged<T,P>}
 */
export const makeTagged = (tag, payload) => {
  typeof tag === 'string' ||
    Fail`The tag of a tagged record must be a string: ${tag}`;
  assertPassable(harden(payload));
  return harden(
    create(objectPrototype, {
      [PASS_STYLE]: { value: 'tagged' },
      [Symbol.toStringTag]: { value: tag },
      payload: { value: payload, enumerable: true },
    }),
  );
};
harden(makeTagged);
