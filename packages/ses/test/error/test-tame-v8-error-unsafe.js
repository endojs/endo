import test from 'ava';
import '../../index.js';

// TODO test Error API in
//    * non - start compartments
//    * with { errorTaming: 'safe' }
//    * on non-v8
lockdown({ errorTaming: 'unsafe' });

// depd (https://github.com/dougwilson/nodejs-depd) uses a stack trace to
// determine the call site of a deprecated function

function simulateDepd() {
  function prepareObjectStackTrace(_, stack) {
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

test('SES compartment error compatibility - minimal case', t => {
  const c1 = new Compartment({ t });
  const result = c1.evaluate(`
    const obj = {};
    Error.stackTraceLimit = 10;
    t.is(Error.stackTraceLimit, undefined, 'assignment ignored');
    Error.captureStackTrace(obj);
    obj.stack;
  `);
  t.is(result, '');
});

test('SES compartment error compatibility - basic: prepareStackTrace accepts assignment', t => {
  const c1 = new Compartment({ t });
  const result = c1.evaluate(`
    const obj = {};
    const newPST = (stack) => stack;
    Error.prepareStackTrace = newPST;
    t.not(Error.prepareStackTrace, newPST, 'assignment ignored');
    Error.captureStackTrace(obj);
    obj.stack;
  `);
  t.is(result, '');
});

test('SES compartment error compatibility - functional prepareStackTrace', t => {
  const c1 = new Compartment({ t });
  const result = c1.evaluate(`
    const prepareObjectStackTrace = (_, stack) => {
      t.fail('must not be called');
    };
    const obj = {};
    Error.prepareStackTrace = prepareObjectStackTrace;
    Error.captureStackTrace(obj);
    obj.stack;
  `);
  t.is(result, '');
});

test('SES compartment error compatibility - endow w Error power', t => {
  // TODO Using the endowed Error, a test like this one should be able to
  // assign prepareStackTrace to something interesting. The next test case,
  // "Error compatibility - depd" does so. What we can do with the
  // start compartment's powerful Error object should be insensitive to
  // whether we're in a compartment. However, I have so far failed to do
  // so in this test case.

  const c1 = new Compartment({ t, Error });
  const result = c1.evaluate(`
    const obj = {
      toString: () => 'Pseudo Error',
    };
    const limit = Error.stackTraceLimit;
    const newSTL = Math.max(10, limit);
    Error.stackTraceLimit = 0;
    t.is(Error.stackTraceLimit, 0, 'stackTraceLimit assigned');
    Error.stackTraceLimit = newSTL;
    t.is(Error.stackTraceLimit, newSTL, 'stackTraceLimit assigned');
    Error.captureStackTrace(obj);
    Error.stackTraceLimit = limit;
    obj.stack;
  `);
  t.assert(result.startsWith('Pseudo Error\n  at '));
});

test('Error compatibility - depd', t => {
  // the Start Compartment should support this sort of manipulation
  const name = simulateDepd();
  t.is(name, 'middle');

  // however a new Compartment should not
  // const c = new Compartment({ console });
  // const sim = c.evaluate(`(${simulateDepd})`);
  // t.throws(() => sim(), /Cannot add property prepareStackTrace, object is not extensible/);
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
  t.not(
    stack[0].search(/at middle/),
    -1,
    '"middle" found in callstack() output',
  );
});

// callsite (https://www.npmjs.com/package/callsite) returns a list of stack
// frames, obtained by replacing Error.prepareStackTrace .
function simulateCallsite() {
  function callsite() {
    const orig = Error.prepareStackTrace;
    Error.prepareStackTrace = (_, stack) => stack;
    const err = new Error();

    // note: the upstream `callsite` library uses
    // `Error.captureStackTrace(err, arguments.callee);`
    // We test a fixed version, to exercise compatibility with the SES
    // unsafe-tamed Error object, even though the original uses a
    // sloppy mode (non-strict mode) `arguments.callee` that cannot
    // work in module code or under SES.
    Error.captureStackTrace(err, callsite);
    const { stack } = err;
    Error.prepareStackTrace = orig;
    return stack;
  }

  function middle() {
    return callsite();
  }

  return middle()[0].getFunctionName();
}

test('Error compatibility - callsite', t => {
  const name = simulateCallsite();
  t.is(name, 'middle');
});

// callsites from
// https://github.com/sindresorhus/callsites/blob/master/index.js
// triggers prepareStackTrace by accessing the `.stack` property
// of an error, rather than calling `captureStackTrace`.
function simulateCallsites() {
  function callsites() {
    const orig = Error.prepareStackTrace;
    Error.prepareStackTrace = (_, stack) => stack;
    const stack = new Error().stack.slice(1);
    Error.prepareStackTrace = orig;
    return stack;
  }

  function middle() {
    return callsites();
  }

  return middle()[0].getFunctionName();
}

test('Error compatibility - callsites', t => {
  const name = simulateCallsites();
  t.is(name, 'middle');
});

test('Error compatibility - save and restore prepareStackTrace', t => {
  const pst1 = (_err, _sst) => 'x';
  Error.prepareStackTrace = pst1;
  t.is(new Error().stack, 'x');
  const pst2 = Error.prepareStackTrace;
  t.not(pst1, pst2);
  t.is(pst2({}, []), 'x');
  Error.prepareStackTrace = pst2;
  t.is(new Error().stack, 'x');
  const pst3 = Error.prepareStackTrace;
  t.is(pst2, pst3);
});
