
export default function tameError() {
  if (!(Object.isExtensible(Error))) {
    throw Error('huh Error is not extensible');
  }
  /* this worked back when we were running it on a global, but stopped
  working when we turned it into a shim */
  /*
  Object.defineProperty(Error.prototype, "stack",
                        { get() { return 'stack suppressed'; } });
  */
  delete Error.captureStackTrace;
  if ('captureStackTrace' in Error) {
    throw Error('hey we could not remove Error.captureStackTrace');
  }
}
