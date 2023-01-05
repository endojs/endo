// Copyright (C) 2018 Agoric
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { globalThis, TypeError, assign } from './src/commons.js';

import { tameFunctionToString } from './src/tame-function-tostring.js';
import { getGlobalIntrinsics } from './src/intrinsics.js';
import { lockdown } from './src/lockdown-shim.js';
import { makeCompartmentConstructor } from './src/compartment-shim.js';
import { assert } from './src/error/assert.js';

/** getThis returns globalThis in sloppy mode or undefined in strict mode. */
function getThis() {
  return this;
}

if (getThis()) {
  // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_NO_SLOPPY.md
  throw new TypeError(`SES failed to initialize, sloppy mode (SES_NO_SLOPPY)`);
}

const markVirtualizedNativeFunction = tameFunctionToString();

const Compartment = makeCompartmentConstructor(
  makeCompartmentConstructor,
  getGlobalIntrinsics(globalThis),
  markVirtualizedNativeFunction,
);

assign(globalThis, {
  lockdown,
  Compartment,
  assert,
});
