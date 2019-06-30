// v8 specific portion of error stack shim
// Assumes https://v8.dev/docs/stack-trace-api

import { lineToFrame } from './scrapedStackFrames';

const { getOwnPropertyDescriptor, apply } = Reflect;

function getV8StackFramesUsing(UnsafeError) {
  // Could caputre first if useful internally
  // const unsafeCaptureStackTrace = UnsafeError.captureStackTrace;
  // Since UnsafeError itself should never be reachable, this delete
  // is not technically necessary.
  delete UnsafeError.captureStackTrace;

  const ssts = new WeakMap();  // error -> sst
  const framesMemo = new WeakMap();  // error -> frames

  UnsafeError.prepareStackTrace = (error, sst) => {
    ssts.set(error, sst);

    // See https://bugs.chromium.org/p/v8/issues/detail?id=9386
    // See NOTE below about the reentrancy hazard we need to beware of.
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
      throw new TypeError('Error object expected');
    }
    let sst = ssts.get(error);
    if (sst === undefined && error instanceof Error) {
      // We hope it triggers prepareStackTrace
      // eslint-disable-next-line no-unused-vars
      const ignore = error.stack;
      sst = ssts.get(error);
    }
    // NOTE: Because of our workaround of
    // https://bugs.chromium.org/p/v8/issues/detail?id=9386 in
    // prepareStackTrace above, the "error.stack" expression
    // immediately above, which triggers prepareStackTrace, might
    // call getStackString which calls ... which calls
    // getV8StackFrames, reentering it within the outer
    // execution. This is why we wait till this point to check the
    // framesMemo. In this reentrancy case, the inner call will set
    // the memo, returning to the outer call which proceeds at this
    // point, finding that the error is already in the memo.
    let frames = framesMemo.get(error);
    if (frames) {
      return frames;
    }
    if (sst === undefined) {
      return [];
    }
    frames = sst.map(callSiteToFrame);
    framesMemo.set(error, frames);
    ssts.delete(error);
    return frames;
  }
  return getV8StackFrames;
}

export { getV8StackFramesUsing };
