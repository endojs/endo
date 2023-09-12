import { Far } from './make-far.js';

/**
 * Classes whose instances should be Far objects should inherit from
 * this convenient base class. Note that the constructor of this base class
 * freezes the instance in an empty state, so all is interesting attributes
 * can only depend on its identity and what it inherits from.
 * This includes private fields, as those are keyed only on
 * this object's identity. However, we discourage (but cannot prevent) such
 * use of private fields, as they cannot easily be refactored into exo state.
 */
export const FarBaseClass = class FarBaseClass {
  constructor() {
    harden(this);
  }
};

Far('FarBaseClass', FarBaseClass.prototype);
harden(FarBaseClass);
