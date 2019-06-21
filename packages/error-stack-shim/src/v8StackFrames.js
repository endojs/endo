// Platform dependent portion of error stack shim

function getV8StackFramesUsing(UnsafeError) {

  const unsafeCaptureStackTrace = UnsafeError.captureStackTrace;

  UnsafeError.prepareStackTrace = function(err, sst) {
    if (ssts === undefined) {
      // If an error happens in the debug module after setting up
      // this prepareStackTrace but before or during the
      // initialization of ssts, then this method gets called
      // with ssts still undefined (undefined). In that case, we
      // should report the error we're asked to prepare, rather
      // than an error thrown by failing to prepare it.
      ses.logger.error('Error while initializing debug module', err);
    } else {
      ssts.set(err, sst);
    }
    // Technically redundant, but prepareStackTrace is supposed
    // to return a value, so this makes it clearer that this value
    // is undefined (undefined).
    return undefined;
  };
  
  UnsafeError.captureStackTrace = function(obj, opt_MyError) {
    const wasFrozen = Object.isFrozen(obj);
    const stackDesc = Object.getOwnPropertyDescriptor(obj, 'stack');
    try {
      const result = unsafeCaptureStackTrace(obj, opt_MyError);
      const ignore = obj.stack;
      return result;
    } finally {
      if (wasFrozen && !Object.isFrozen(obj)) {
        if (stackDesc) {
          Object.defineProperty(obj, 'stack', stackDesc);
        } else {
          delete obj.stack;
        }
        Object.freeze(obj);
      }
    }
  };
  
  const ssts = new WeakMap(); // error -> sst
  
  /**
   * Given a v8 CallSite object as defined at
   * https://code.google.com/p/v8-wiki/wiki/JavaScriptStackTraceApi
   * return a stack frame in Extended Causeway Format as defined
   * above.
   */
  function callSite2CWFrame(callSite) {
    if (typeof callSite === 'string') {
      // See https://code.google.com/p/v8/issues/detail?id=4268
      return line2CWFrame(callSite);
    }
    const source = callSite.isEval() ?
        callSite2CWFrame(callSite.getEvalOrigin()) :
        '' + (callSite.getFileName() || '?');
    const name = '' + (callSite.getFunctionName() ||
                     callSite.getMethodName() || '?');
    return {
      name: name,
      source: source,
      span: [ [ callSite.getLineNumber(), callSite.getColumnNumber() ] ]
    };
  }
  
  /**
   * Returns a stack in Extended Causeway Format as defined above.
   */
  function getCWStack(err) {
    if (Object(err) !== err) { return undefined; }
    const sst = ssts.get(err);
    if (sst === undefined && err instanceof Error) {
      // We hope it triggers prepareStackTrace
      const ignore = err.stack;
      sst = ssts.get(err);
    }
    if (sst === undefined) { return undefined; }
    
    return {calls: sst.map(callSite2CWFrame)};
  };
  
  
}

export { getV8StackFramesUsing };
