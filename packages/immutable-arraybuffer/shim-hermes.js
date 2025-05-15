import {
  isBufferImmutable,
  sliceBufferToImmutable,
} from './src/limited-pony-for-hermes.js';

const { getOwnPropertyDescriptors, defineProperties } = Object;
const { prototype: arrayBufferPrototype } = ArrayBuffer;

const arrayBufferMethods = {
  /**
   * Creates an immutable slice of the given buffer.
   * @this {ArrayBuffer} buffer The original buffer.
   * @param {number} [start] The start index.
   * @param {number} [end] The end index.
   * @returns {ArrayBuffer} The sliced immutable ArrayBuffer.
   */
  sliceToImmutable(start = undefined, end = undefined) {
    return sliceBufferToImmutable(this, start, end);
  },
  get immutable() {
    return isBufferImmutable(this);
  },
};

if ('transfer' in arrayBufferPrototype) {
  console.warn(
    'Could have used the full shim, rather than the limited one for Hermes',
  );
}

if ('sliceToImmutable' in arrayBufferPrototype) {
  // Modern shim practice frowns on conditional installation, at least for
  // proposals prior to stage 3. This is so changes to the proposal since
  // an old shim was distributed don't need to worry about the proposal
  // breaking old code depending on the old shim. Thus, if we detect that
  // we're about to overwrite a prior installation, we simply issue this
  // warning and continue.
  //
  // TODO, if the primordials are frozen after the prior implementation, such as
  // by `lockdown`, then this precludes overwriting as expected. However, for
  // this case, the following warning text will be confusing.
  console.warn(
    'About to overwrite a prior implementation of "sliceToImmutable"',
  );
}

defineProperties(
  arrayBufferPrototype,
  getOwnPropertyDescriptors(arrayBufferMethods),
);
