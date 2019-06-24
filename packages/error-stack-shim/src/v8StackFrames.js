/* global require module */

// v8 specific portion of error stack shim
// Assumes https://v8.dev/docs/stack-trace-api

// import { lineToFrame } from './scrapedStackFrames';
const { lineToFrame } = require('./scrapedStackFrames');

function getV8StackFramesUsing(UnsafeError) {
  const unsafeCaptureStackTrace = UnsafeError.captureStackTrace;

  const ssts = new WeakMap(); // error -> sst

  UnsafeError.prepareStackTrace = (error, sst) => {
    ssts.set(error, sst);
  };

  UnsafeError.captureStackTrace = (obj, optMyError = undefined) => {
    const wasFrozen = Object.isFrozen(obj);
    const stackDesc = Object.getOwnPropertyDescriptor(obj, 'stack');
    try {
      const result = unsafeCaptureStackTrace(obj, optMyError);
      // eslint-disable-next-line no-unused-vars
      const ignore = obj.stack;
      return result;
    } finally {
      if (wasFrozen && !Object.isFrozen(obj)) {
        // TODO Do we still need to worry about this bug?
        // Was it ever filed? Issue url?
        if (stackDesc) {
          Object.defineProperty(obj, 'stack', stackDesc);
        } else {
          delete obj.stack;
        }
        Object.freeze(obj);
      }
    }
  };

  function callSiteToFrame(callSite) {
    if (typeof callSite === 'string') {
      // See https://bugs.chromium.org/p/v8/issues/detail?id=4268
      return lineToFrame(callSite);
    }
    const source = callSite.isEval()
      ? callSiteToFrame(callSite.getEvalOrigin())
      : `${callSite.getFileName() || '?'}`;
    const name = `${callSite.getFunctionName() ||
      callSite.getMethodName() ||
      '?'}`;
    return {
      name,
      source,
      span: [[callSite.getLineNumber(), callSite.getColumnNumber()]],
    };
  }

  function getV8StackFrames(error) {
    if (Object(error) !== error) {
      return undefined;
    }
    let sst = ssts.get(error);
    if (sst === undefined && error instanceof Error) {
      // We hope it triggers prepareStackTrace
      // eslint-disable-next-line no-unused-vars
      const ignore = error.stack;
      sst = ssts.get(error);
    }
    if (sst === undefined) {
      return [];
    }
    return sst.map(callSiteToFrame);
  }
  return getV8StackFrames;
}

// export { getV8StackFramesUsing };
module.exports = { getV8StackFramesUsing };
