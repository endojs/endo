// todo: copy exact copies from es-lab startSES.js, commit, then edit down to
// what we've got here and put that into a second commit


function tameDate(global) {
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
  Date.now = () => NaN;
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

function tamePrimordials(global) {
  tameDate(global);
  tameMath(global);
  tameIntl(global);
  tameError(global);
}


function populateSESObject(global) {
  global.SES = OMGQUINE;
}

export const tamePrimordialsShim, removePropertiesShim, populateSESObjectShim, deepFreezeShim,
