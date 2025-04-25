/// <reference types="ses"/>

import { Fail } from '@endo/errors';
import { PASS_STYLE } from './passStyle-helpers.js';

/**
 * @import {CopySelector} from './types.js'
 */

const { create, prototype: objectPrototype } = Object;

/**
 * @template {string} T
 * @param {T} tag
 * @returns {CopySelector<T>}
 */
export const makeSelector = tag => {
  typeof tag === 'string' ||
    Fail`The tag of a selector record must be a string: ${tag}`;
  return harden(
    create(objectPrototype, {
      [PASS_STYLE]: { value: 'selector' },
      [Symbol.toStringTag]: { value: tag },
    }),
  );
};
harden(makeSelector);
