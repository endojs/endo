/* global require module */

// v8 specific portion of error stack shim
// Assumes https://v8.dev/docs/stack-trace-api

// import { lineToFrame } from './scrapedStackFrames';
const { lineToFrame } = require('./scrapedStackFrames');

const { defineProperty, getOwnPropertyDescriptor, apply } = Reflect;

function getV8StackFramesUsing(UnsafeError) {
  const unsafeCaptureStackTrace = UnsafeError.captureStackTrace;
  delete UnsafeError.captureStackTrace;

  const ssts = new WeakMap(); // error -> sst

  UnsafeError.prepareStackTrace = (error, sst) => {
    ssts.set(error, sst);
    
    // See https://bugs.chromium.org/p/v8/issues/detail?id=9386    
    const desc = getOwnPropertyDescriptor(Error.prototype, 'stack');
    return apply(desc.get, error, []);
  };

  function callSiteToFrame(callSite) {
    if (typeof callSite === 'string') {
      // See https://bugs.chromium.org/p/v8/issues/detail?id=4268
      return lineToFrame(callSite);
    }
    const source = callSite.isEval()
      ? callSiteToFrame(callSite.getEvalOrigin())
      : `${callSite.getFileName() || '?'}`;
    let name = `${callSite.getFunctionName() ||
      callSite.getMethodName() ||
      '?'}`;
    const typeName = callSite.getTypeName();
    if (typeName) {
      name = `${typeName}.${name}`;
    }
    if (callSite.isConstructor()) {
      name = `new ${name}`;
    }
    if (typeof callSite.isAsync === 'function' && callSite.isAsync()) {
      name = `async ${name}`;
    }
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
