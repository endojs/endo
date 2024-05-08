import { globalThis } from './commons.js';
import { makeCompartmentConstructor } from './compartment.js';
import { tameFunctionToString } from './tame-function-tostring.js';
import { getGlobalIntrinsics } from './intrinsics.js';
import { chooseReporter } from './reporting.js';

const markVirtualizedNativeFunction = tameFunctionToString();

const muteReporter = chooseReporter('none');

// @ts-ignore Compartment is definitely on globalThis.
globalThis.Compartment = makeCompartmentConstructor(
  makeCompartmentConstructor,
  // Any reporting that would need to be done should have already been done
  // during `lockdown()`.
  // See https://github.com/endojs/endo/pull/2624#discussion_r1840979770
  getGlobalIntrinsics(globalThis, muteReporter),
  markVirtualizedNativeFunction,
  {
    enforceNew: true,
  },
);
