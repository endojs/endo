/* globals globalThis */
export default function tameGlobalRegExpObject() {
  // We want to delete RegExp.$1, as well as any other surprising properties.
  // On some engines we can't just do 'delete RegExp.$1'.
  // Capture the original constructor.
  const unsafeRegExp = RegExp;

  // Delete property.
  delete RegExp.prototype.compile;
  if ('compile' in RegExp.prototype) {
    throw Error('hey we could not remove RegExp.prototype.compile');
  }

  // Tame RegExp constructor.
  const safeRegExp = function RegExp() {
    // eslint-disable-next-line prefer-rest-params
    return Reflect.construct(unsafeRegExp, arguments, new.target);
  };
  safeRegExp.prototype = unsafeRegExp.prototype;
  unsafeRegExp.prototype.constructor = safeRegExp;

  globalThis.RegExp = safeRegExp;

  if ('$1' in RegExp) {
    throw Error('hey we could not remove RegExp.$1');
  }
}
