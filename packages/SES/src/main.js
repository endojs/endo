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

import { getIntrinsics } from '@agoric/intrinsics';
import whitelistIntrinsics from '@agoric/intrinsics-whitelist';
import repairLegacyAccessors from '@agoric/repair-legacy-accessors';

import tameFunctionConstructors from '@agoric/tame-function-constructors';
import tameGlobalDateObject from '@agoric/tame-global-date-object';
import tameGlobalMathObject from '@agoric/tame-global-math-object';
import tameGlobalIntlObject from '@agoric/tame-global-intl-object';
import tameGlobalErrorObject from '@agoric/tame-global-error-object';
import tameGlobalRegExpObject from '@agoric/tame-global-regexp-object';

import enablePropertyOverrides from '@agoric/enable-property-overrides';
import makeHardener from '@agoric/make-hardener';
import Evaluator from '@agoric/evaluator-shim';

const ALLOW = 'allow';

export function lockdown(options = {}) {
  /**
   * 1. Expose the SES APIs.
   */

  // Build a harden() with an empty fringe.
  const harden = makeHardener();

  // eslint-disable-next-line no-new-func
  const global = Function('return this')();

  // Add the API to the global object.
  Object.defineProperties(global, {
    harden: {
      value: harden,
      configurable: true,
      writable: true,
      enumerable: false,
    },
    Evaluator: {
      value: Evaluator,
      configurable: true,
      writable: true,
      enumerable: false,
    },
  });

  /**
   * 2. Standardize the environment.
   */

  // Extract the intrinsics from the global.
  const intrinsics = getIntrinsics();

  // Remove non-standard properties.
  whitelistIntrinsics(intrinsics);

  // Repair problems with legacy accessors if necessary.
  repairLegacyAccessors();

  /**
   * 3. Tame the environment.
   */

  tameFunctionConstructors();

  if (options.dateMode !== ALLOW) {
    tameGlobalDateObject();
  }

  if (options.mathMode !== ALLOW) {
    tameGlobalMathObject();
  }

  if (options.intlMode !== ALLOW) {
    tameGlobalIntlObject();
  }

  if (options.errorMode !== ALLOW) {
    tameGlobalErrorObject();
  }

  if (options.regexpMode !== ALLOW) {
    tameGlobalRegExpObject();
  }

  /**
   * 4. Freeze the environment.
   */

  // Circumvent the override mistake.
  const initialFreeze = [];
  enablePropertyOverrides(intrinsics, initialFreeze);

  if (options.unfrozenMode !== ALLOW) {
    // Finally freeze all the primordials, and the global object. This must
    // be the last thing we do that modifies the Realm's globals.
    harden(intrinsics);
    harden(initialFreeze);
  }
}
