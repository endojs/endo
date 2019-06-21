// Shim https://tc39.es/proposal-error-stacks

import harden from '@agoric/harden';

import { getV8StackFramesUsing } from './v8StackFrames';

import { getScrapedStackFramesUsing } from './scrapedStackFrames';

var System = System || {};

var Error;

(function shimGetStack() {
  "use strict";

  const PROVIDE_OPTIOAL_STACK_ACCESSOR = false;

  if (typeof System.getStack === 'function') {
    return;
  }

  const UnsafeError = Error;
  function FakeError(...args) {
    if (new.target) {
      return Reflect.construct(UnsafeError, args, new.target);
    } else {
      return Reflect.apply(UnsafeError, undefined, args);
    }
  }
  FakeError.prototype = UnsafeError.prototype;
  FakeError.prototype.constructore = FakeError;
  Error = FakeError;

  [EvalError, RangeError, ReferenceError, SyntaxError, TypeError, URIError
   ].forEach(function(err) {
     if (Object.getPrototypeOf(err) === UnsafeError) {
       Object.setPrototypeOf(err, FakeError);
     }
   });

  let getStackFrames = function uselessGetStackFrames(error) {
    return harden([]);
  };

  ////////////////////////////////////////////////////////////////////
  ////////// dispatch to platform dependent portions of shim /////////
  if ('captureStackTrace' in UnsafeError) {
    getStackFrames = getV8StackFramesUsing(UnsafeError);
  } else {
    let getRawStackString = function defaultRawStackString(error) {
      return error.stack;
    };
    const primStackDesc =
          Reflect.getOwnPropertyDescriptor(Error.prototype, 'stack');
    const primStackGetter = primStackDesc && primStackDesc.get;
    if (primStackGetter) {
      delete Error.prototype.stack;
      getRawStackString = function(error) {
        return Reflect.apply(primStackGetter, error, []);
      };
    }
    getStackFrames = getScrapedStackFramesUsing(getRawStackString);
  }
  /////// The rest of this file should be platform independent ///////
  ////////////////////////////////////////////////////////////////////

  function getPositionString(pos) {
    let posString = `${pos[0]}`;
    if (pos[1]) {
      posString += `:${pos[1]}`;
    }
    return posString;
  }

  function getStackFrameSpanString(span) {
    let spanString = getPositionString(span[0]);
    if (span[1]) {
      spanString += `::${getPositionString(span[1])}`;
    }
    return spanString;
  }

  function getFrameString(frame) {
    let source = frame.source;
    if (typeof source !== 'string') {
      source = `eval ${getFrameString(source)}`;
    }
    const spanString = getStackFrameSpanString(source.span);
    return ` at ${frame.name} (${source}${spanString})`;
  }

  function getStack(error) {
    const frames = getStackFrames(error);
    const string = `${error} ${frames.map(getFrameString).join('\n ')}`;
    return harden({ frames, string });
  }
  
  function getStackString(error) {
    return getStack(error).string;
  }

  System.getStack = getStack;
  System.getStackString = getStackString;

  // Reconcile proposal:
  // Is normative optioal, but "absence" should be space-returning accessor.
  // No setter. Setter bad.
  if (PROVIDE_OPTIOAL_STACK_ACCESSOR) {
    Reflect.defineProperty(Error.prototype, 'stack', {
      get() { return getStackString(this); },
      set: undefined,
      enumerable: false,
      configurable: true
    });
  } else {
    Reflect.defineProperty(Error.prototype, 'stack', {
      get() { return ' '; },
      set: undefined,
      enumerable: false,
      configurable: true
    });
  }
  
}());
