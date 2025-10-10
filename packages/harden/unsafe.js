/* This implementation of harden first senses and provides the implementation
 * of harden present in the global object or shared intrinsics.
 * Failing to find an existing implementation, this provides and installs a
 * fake version that does nothing.
 * This version can be selected with the package.json condition
 * `"harden:unsafe"`, as with `node -C harden:unsafe` or Endo's
 * `bundle-source -C harden:unsafe`.
 */

import { makeHardenerSelector } from './make-selector.js';

const makeFakeHarden = () => {
  const harden = o => o;
  harden.isFake = true;
  harden.lockdownError = new Error(
    'Cannot lockdown (repairIntrinsics) because @endo/harden used before lockdown on this stack',
  );
  return harden;
};

const { harden, isFrozenIfLockdown } = makeHardenerSelector(makeFakeHarden);

export default harden;

export { isFrozenIfLockdown };
