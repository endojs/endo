/* global harden SES */
// Adapted from SES/Caja - Copyright (C) 2011 Google Inc.
// Copyright (C) 2018 Agoric

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

import makeHardener from '@agoric/make-hardener';

// Try to use SES's own harden if available.
let h = typeof harden === 'undefined' ? undefined : harden;
if (h === undefined) {
  // Legacy SES compatibility.
  h = typeof SES === 'undefined' ? undefined : SES.harden;
}

if (h === undefined) {
  // Warn if they haven't explicitly set harden or SES.harden.
  console.warn(
    `SecurityWarning: '@agoric/harden' doesn't prevent prototype poisoning without SES`,
  );
}

// Create the shim if h is anything falsey.
if (!h) {
  h = makeHardener();
}

const constHarden = h;
export default constHarden;
