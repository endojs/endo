/* global require module */

// Shim https://tc39.es/proposal-error-stacks

// import harden from '@agoric/harden';
const harden = Object.freeze;

// import { getV8StackFramesUsing } from './v8StackFrames';
// import { getScrapedStackFramesUsing } from './scrapedStackFrames';
const { getV8StackFramesUsing } = require('./v8StackFrames');
const { getScrapedStackFramesUsing } = require('./scrapedStackFrames');

// Reconcile proposal:
// Is normative optional, but "absence" should be space-returning
// accessor.
// If accessor provided, spec demands setter. But this is silly, so we
// we make it separately switchable.
const PROVIDE_OPTIONAL_STACK_GETTER = true;
const PROVIDE_OPTIONAL_STACK_SETTER = false;

const {
  getPrototypeOf,
  setPrototypeOf,
  construct,
  apply,
  getOwnPropertyDescriptor,
  defineProperty,
} = Reflect;

const UnsafeError = Error;
function FakeError(...args) {
  if (new.target) {
    return construct(UnsafeError, args, new.target);
  }
  return apply(UnsafeError, this, args);
}
FakeError.prototype = UnsafeError.prototype;
FakeError.prototype.constructore = FakeError;
// eslint-disable-next-line no-global-assign
Error = FakeError;

[
  EvalError,
  RangeError,
  ReferenceError,
  SyntaxError,
  TypeError,
  URIError,
].forEach(err => {
  if (getPrototypeOf(err) === UnsafeError) {
    setPrototypeOf(err, FakeError);
  }
});

const stackGetter = PROVIDE_OPTIONAL_STACK_GETTER
  ? function stackGetter() {
      // eslint-disable-next-line no-use-before-define
      return getStackString(this);
    }
  : () => ' ';
const stackSetter = PROVIDE_OPTIONAL_STACK_SETTER
  ? function stackSetter(v) {
      defineProperty(this, 'stack', {
        value: v,
        writable: false,
        enumerable: false,
        configurable: true,
      });
    }
  : undefined;

defineProperty(FakeError.prototype, 'stack', {
  get: stackGetter,
  set: stackSetter,
  enumerable: false,
  configurable: true,
});

// Default if we can't do anything for a given platform
let getStackFrames = _error => harden([]);

// //////////////////////////////////////////////////////////////////
// //////// dispatch to platform dependent portions of shim /////////
if ('captureStackTrace' in UnsafeError) {
  // v8 only
  getStackFrames = getV8StackFramesUsing(UnsafeError);
} else {
  let getRawStackString;
  const primStackDesc = getOwnPropertyDescriptor(FakeError.prototype, 'stack');
  const primStackGetter = primStackDesc && primStackDesc.get;
  if (primStackGetter) {
    // At the time of this writing, perhaps Firefox only
    delete FakeError.prototype.stack;
    // May error
    getRawStackString = error => apply(primStackGetter, error, []);
  } else {
    // May return anything
    getRawStackString = error => error.stack;
  }
  getStackFrames = getScrapedStackFramesUsing(getRawStackString);
}
// ///// The rest of this file should be platform independent ///////
// //////////////////////////////////////////////////////////////////

function getPositionString(pos) {
  return pos.join(':');
}

function getStackFrameSpanString(span) {
  return span.map(getPositionString).join('::');
}

function getFrameString(frame) {
  const { name, source, span } = frame;
  let location = source;
  if (typeof location !== 'string') {
    location = `eval ${getFrameString(location)}`;
  }
  const spanString = getStackFrameSpanString(span);
  if (spanString) {
    location = `${location}:${spanString}`;
  }
  return `at ${name} (${location})`;
}

function getStack(error) {
  const frames = getStackFrames(error);
  const string = [`${error}`, ...frames.map(getFrameString)].join('\n  ');
  return harden({ frames, string });
}

function getStackString(error) {
  return getStack(error).string;
}

// export { getStack, getStackString };
module.exports = { getStack, getStackString };
