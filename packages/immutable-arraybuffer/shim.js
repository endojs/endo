import { transferBufferToImmutable, isBufferImmutable } from './index.js';

const { getOwnPropertyDescriptors, defineProperties } = Object;
const { prototype: arrayBufferPrototype } = ArrayBuffer;

const arrayBufferMethods = {
  transferToImmutable() {
    return transferBufferToImmutable(this);
  },
  get immutable() {
    return isBufferImmutable(this);
  },
};

if ('transferToImmutable' in arrayBufferPrototype) {
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
    'About to overwrite a prior implementation of "transferToImmutable"',
  );
}

defineProperties(
  arrayBufferPrototype,
  getOwnPropertyDescriptors(arrayBufferMethods),
);
