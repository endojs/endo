import { globalThis } from './commons.js';
import { makeCompartmentConstructor } from './compartment.js';
import { tameFunctionToString } from './tame-function-tostring.js';
import { getGlobalIntrinsics } from './intrinsics.js';

const markVirtualizedNativeFunction = tameFunctionToString();

// @ts-ignore Compartment is definitely on globalThis.
globalThis.Compartment = makeCompartmentConstructor(
  makeCompartmentConstructor,
  getGlobalIntrinsics(globalThis),
  markVirtualizedNativeFunction,
);
