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
  const c1 = new Compartment({ t, Error });
  const result = c1.evaluate(`
    const obj = {
      name: 'Pseudo Error',
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

test('SES compartment error compatibility - endow w Error with locally configurable prepareStackTrace', t => {
  // The purpose of this test is mostly to ensure the Error in start compartment can be wrapped to provide prepareStackTrace functionality
  // and demonstrate how that could be implemented for packages which use the CallSite list.
  function createLocalError(Error) {
    const LocalError = Object.create(Error);

    // Simulate original object representing CallSite.
    // This is just an example implementation.
    function CallSite(text) {
      return {
        toString: () => text,
        getFileName: () => text.replace(/.*\(([^:]+):*.*\n/g, '$1'),
        getLineNumber: () => 1,
        getColumnNumber: () => 1,
        isEval: () => false,
        getFunctionName: () => text.split(' ')[0],
      };
    }

    Object.defineProperty(LocalError, 'captureStackTrace', {
      value(obj) {
        const tmp = {};
        Error.captureStackTrace(tmp);
        if (this.prepareStackTrace) {
          obj.stack = this.prepareStackTrace(
            tmp.stack,
            // Simulate original object representing CallSite list.
            // This is just an example implementation.
            tmp.stack
              .split(/^\s+at /gm)
              .slice(1)
              .map(CallSite),
          );
        } else {
          obj.stack = tmp.stack;
        }
      },
    });
    Object.defineProperty(LocalError, 'prepareStackTrace', {
      value: undefined,
      writable: true,
    });

    return LocalError;
  }

  const c1 = new Compartment({ t, Error: createLocalError(Error) });
  const result1 = c1.evaluate(`
  ${simulateDepd.toString()};
  simulateDepd();
  `);
  t.is(result1, 'getStack');

  // assert LocalError is not leaking to Error prototype
  const evilC = new Compartment({ t, Error: createLocalError(Error) });
  evilC.evaluate(`
    Error.prepareStackTrace = () => {
      t.fail('prepareStackTrace from evil compartment should not have been called');
    };
  `);
  c1.evaluate(`
    Error.captureStackTrace({})
  `);
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
    return Error().stack.split('\n').splice(2);
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
    const err = Error();

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
    const stack = Error().stack.slice(1);
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
  t.is(Error().stack, 'x');
  const pst2 = Error.prepareStackTrace;
  t.not(pst1, pst2);
  t.is(pst2({}, []), 'x');
  Error.prepareStackTrace = pst2;
  t.is(Error().stack, 'x');
  const pst3 = Error.prepareStackTrace;
  t.is(pst2, pst3);
});
