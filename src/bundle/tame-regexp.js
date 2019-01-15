
export default function tameRegExp() {
  delete RegExp.prototype.compile;
  if ('compile' in RegExp.prototype) {
    throw Error('hey we could not remove RegExp.prototype.compile');
  }

  // We want to delete RegExp.$1, as well as any other surprising properties.
  // On some engines we can't just do 'delete RegExp.$1'.
  const unsafeRegExp = RegExp;

  RegExp = function RegExp(...args) {
    return Reflect.construct(unsafeRegExp, args, new.target);
  };
  RegExp.prototype = unsafeRegExp.prototype;
  unsafeRegExp.prototype.constructor = RegExp;

  if ('$1' in RegExp) {
    throw Error('hey we could not remove RegExp.$1');
  }

}
