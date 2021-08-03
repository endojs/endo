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

/* global process */

import {
  globalThis,
  Error,
  assign,
  defineProperty,
  getOwnPropertyDescriptor,
} from './src/commons.js';
import { tameFunctionToString } from './src/tame-function-tostring.js';
import { getGlobalIntrinsics } from './src/intrinsics.js';
import { getAnonymousIntrinsics } from './src/get-anonymous-intrinsics.js';
import { makeLockdown } from './src/lockdown-shim.js';
import {
  makeCompartmentConstructor,
  CompartmentPrototype,
} from './src/compartment-shim.js';
import { assert } from './src/error/assert.js';

/** getThis returns globalThis in sloppy mode or undefined in strict mode. */
function getThis() {
  return this;
}

if (getThis()) {
  throw new Error(`SES failed to initialize, sloppy mode (SES_NO_SLOPPY)`);
}

// Protect against the hazard presented by Node.js domains.
if (typeof process === 'object' && process !== null) {
  // Check whether domains were initialized.
  const domainDescriptor = getOwnPropertyDescriptor(process, 'domain');
  if (domainDescriptor !== undefined && domainDescriptor.get !== undefined) {
    throw new Error(
      `SES failed to initialized, Node.js domains have been initialized (SES_NO_DOMAINS)`,
    );
  }
  // Prevent domains from initializing.
  // This is clunky because the exception thrown from the domains package does
  // not direct the user's gaze toward a knowledge base about the problem.
  // The domain module merely throws an exception when it attempts to define
  // the domain property of the process global during its initialization.
  defineProperty(process, 'domain', {
    value: null,
    configurable: false,
    writable: false,
    enumerable: false,
  });
}

const markVirtualizedNativeFunction = tameFunctionToString();

const Compartment = makeCompartmentConstructor(
  makeCompartmentConstructor,
  getGlobalIntrinsics(globalThis),
  markVirtualizedNativeFunction,
);

assign(globalThis, {
  lockdown: makeLockdown(
    makeCompartmentConstructor,
    CompartmentPrototype,
    getAnonymousIntrinsics,
  ),
  Compartment,
  assert,
});
