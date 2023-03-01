/// <reference types="ses"/>

import { PASS_STYLE } from './passStyle-helpers.js';
import { assertPassable } from './passStyleOf.js';

const { create, prototype: objectPrototype } = Object;
const { Fail } = assert;

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
