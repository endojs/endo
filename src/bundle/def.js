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

import { deepFreeze } from './deepFreeze.js';

export function def(node) {
  // TODO HACK return a shallow freeze unless Object.prototype is frozen.
  // This detects whether we are in a SES realm.

  // TODO: this currently does too much work: it doesn't remember what's been
  // frozen already, so it will re-freeze things like Function.prototype
  // every time. To fix this, deepFreeze() needs to be turned into a
  // "Freezer" object that retains a WeakMap of everything it has ever
  // frozen, this def() function should take a Freezer, and the def() exposed
  // as a global should close over the Freezer and deliver it here.
  // deepFreezePrimordials() should use that same Freezer

  if (Object.isFrozen(Object.prototype)) {
    deepFreeze(node);
  } else {
    Object.freeze(node);
  }
  return node;
}
