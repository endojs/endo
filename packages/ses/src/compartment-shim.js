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

// globalThis.Compartment = undefined (on hermes)
// would need to be done at build time
// i.e. a (compartment-mapper) bundle option (in hermes transform)
// but this gets messy quick:

// file:///Users/leo/Documents/GitHub/endo/packages/compartment-mapper/src/link.js:48
// const defaultCompartment = Compartment;
//                            ^

// ReferenceError: Compartment is not defined
//     at file:///Users/leo/Documents/GitHub/endo/packages/compartment-mapper/src/link.js:48:28
//     at ModuleJob.run (node:internal/modules/esm/module_job:271:25)
//     at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:547:26)
//     at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:116:5)
