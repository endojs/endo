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

function tameDate(global, options) {
  const unsafeDate = global.Date;
  // Date(anything) gives a string with the current time
  // new Date(x) coerces x into a number and then returns a Date
  // new Date() returns the current time, as a Date object
  // new Date(undefined) returns a Date object which stringifies to 'Invalid Date'

  function Date(...args) {
    if (new.target === undefined) {
      // we were not called as a constructor
      // this would normally return a string with the current time
      return 'Invalid Date';
    }
    // constructor behavior: if we get arguments, we can safely pass them through
    if (args.length > 0) {
      return Reflect.construct(unsafeDate, args, new.target);
      // todo: make sure our constructor can still be subclassed
    }
    // no arguments: return a Date object, but invalid
    return Reflect.construct(unsafeDate, [NaN], new.target);
  }
  Object.defineProperties(Date, Object.getOwnPropertyDescriptors(unsafeDate));
  // that will copy the .prototype too, so this next line is unnecessary
  //Date.prototype = unsafeDate.prototype;
  unsafeDate.prototype.constructor = Date;
  const dateNowTrap = options.dateNowTrap;
  if (dateNowTrap === false) {
    // allow the original Date.now to keep working
  } else {
    // disable it
    Date.now = () => NaN;
  }
  global.Date = Date;
}

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
  tameDate(global, options);
  tameMath(global);
  tameIntl(global);
  tameError(global);
}
