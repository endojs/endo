/* global Compartment, lockdown */
import test from 'tape';
import '../src/main.js';

// lockdown();

// depd (https://github.com/dougwilson/nodejs-depd) uses a stack trace to
// determine the call site of a deprecated function

function simulateDepd() {
  function prepareObjectStackTrace(obj, stack) {
    return stack;
  }

  function callSiteLocation(callSite) {
    let file = callSite.getFileName() || '<anonymous>';
    const line = callSite.getLineNumber();
    const colm = callSite.getColumnNumber();
    if (callSite.isEval()) {
      file = `${callSite.getEvalOrigin()}, ${file}`;
    }
    const site = [file, line, colm];
    site.callSite = callSite;
    site.name = callSite.getFunctionName();
    return site;
  }

  function getStack() {
    const limit = Error.stackTraceLimit;
    const obj = {};
    const prep = Error.prepareStackTrace;
    Error.prepareStackTrace = prepareObjectStackTrace;
    Error.stackTraceLimit = Math.max(10, limit);
    // capture the stack
    Error.captureStackTrace(obj);
    // slice this function off the top
    const stack = obj.stack.slice(1);
    Error.prepareStackTrace = prep;
    Error.stackTraceLimit = limit;
    return stack;
  }

  function middle() {
    return getStack();
  }

  const site = callSiteLocation(middle()[0]);
  return site.name;
}

test('Error compatibility - depd', t => {
  // the Start Compartment should support this sort of manipulation
  const name = simulateDepd();
  t.equal(name, 'middle');

  // however a new Compartment should not
  // const c = new Compartment({ console });
  // const sim = c.evaluate(`(${simulateDepd})`);
  // t.throws(() => sim(), /Cannot add property prepareStackTrace, object is not extensible/);

  t.end();
});

// callstack (https://github.com/nailgun/node-callstack#readme) returns a
// stack as a list of strings, by reading Error().stack
function simulateCallstack() {
  function callstack() {
    return new Error().stack.split('\n').splice(2);
  }
  function middle() {
    return callstack();
  }
  return middle();
}

test('Error compatibility - callstack', t => {
  const stack = simulateCallstack();
  // TODO: upgrade to tape 5.x for t.match
  // t.match(stack[0], /at middle/, '"middle" found in callstack() output');
  t.notEqual(
    stack[0].search(/at middle/),
    -1,
    '"middle" found in callstack() output',
  );

  // new Compartments *should* include .stack on its Errors. (right??)
  // const c = new Compartment({ console });
  // const sim = c.evaluate(`(${simulateCallstack})`);
  // const stack2 = sim();
  // t.notEqual(stack2[0].search(/at middle/), -1, '"middle" found in callstack() output');

  t.end();
});

// callsite (https://www.npmjs.com/package/callsite) returns a list of stack
// frames, obtained by replacing Error.prepareStackTrace
function simulateCallsite() {
  return function() {
    const orig = Error.prepareStackTrace;
    Error.prepareStackTrace = function(_, stack) {
      return stack;
    };
    const err = new Error();
    Error.captureStackTrace(err, arguments.callee);
    const { stack } = err;
    Error.prepareStackTrace = orig;
    return stack;
  };
}
