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

function tameMath(global) {
  //global.Math.random = () => 4; // https://www.xkcd.com/221
  global.Math.random = () => NaN;
}

function tameIntl(global) {
  // todo: somehow fix these. These almost certainly don't enable the reading
  // of side-channels, but we want things to be deterministic across
  // runtimes.
  global.Intl.DateTimeFormat = () => 0;
  global.Intl.NumberFormat = () => 0;
  global.Intl.getCanonicalLocales = () => [];
  global.Object.prototype.toLocaleString = () => {
    throw new Error('toLocaleString suppressed');
  };
}

function tameError(global) {
  Object.defineProperty(global.Error.prototype, "stack",
                        { get() { return 'stack suppressed'; } });
}

export function tamePrimordials(global, options) {
  tameMath(global);
  tameIntl(global);
  tameError(global);
}
