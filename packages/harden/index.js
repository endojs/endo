/* This implementation of harden first senses and provides the implementation
 * of harden present in the global object or shared intrinsics.
 * Failing to find an existing implementation, this provides and installs
 * a version of harden that freezes the transitive own properties, not
 * traversing prototypes.
 * This preserves the mutability of the realm if used outside HardenedJS.
 *
 * This is the default implementation.
 */

import { makeHardener } from './make-hardener.js';
import { makeHardenerSelector } from './make-selector.js';

const harden = makeHardenerSelector(() =>
  makeHardener({ traversePrototypes: false }),
);
export default harden;
