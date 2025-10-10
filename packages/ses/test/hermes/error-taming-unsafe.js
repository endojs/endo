// tip: use this to trip up platform detection
// Error.captureStackTrace = null

/* global test */
test('error taming unsafe', () => {
  lockdown({
    evalTaming: 'unsafe-eval',
    errorTaming: 'unsafe',
    overrideTaming: 'severe',
    reporting: 'none',
  });

  try {
    throw Error('test');
  } catch (e) {
    assert(
      !e.stack.includes('at [object CallSite]'),
      `stack censorship broken: 
----
 ${e.stack}
----
`,
    );
  }
});
