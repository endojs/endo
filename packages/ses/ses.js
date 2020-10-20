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

import { assign } from './src/commons.js';
import { tameFunctionToString } from './src/tame-function-tostring.js';
import { getGlobalIntrinsics } from './src/intrinsics.js';
import { getModularAnonymousIntrinsics } from './src/get-anonymous-intrinsics.js';
import { makeLockdown, harden } from './src/lockdown-shim.js';
import { whitelist, modulesWhitelist } from './src/whitelist.js';
import {
  CompartmentPrototype,
  StaticModuleRecord,
  makeModularCompartmentConstructor,
} from './src/module-shim.js';
import { assert } from './src/error/assert.js';

assign(whitelist, modulesWhitelist);

const nativeBrander = tameFunctionToString();

const ModularCompartment = makeModularCompartmentConstructor(
  makeModularCompartmentConstructor,
  getGlobalIntrinsics(globalThis),
  nativeBrander,
);

assign(globalThis, {
  harden,
  lockdown: makeLockdown(
    makeModularCompartmentConstructor,
    CompartmentPrototype,
    getModularAnonymousIntrinsics,
  ),
  Compartment: ModularCompartment,
  StaticModuleRecord,
  assert,
});
