/* global test */
test('error taming unsafe-debug', () => {
  lockdown({
    evalTaming: 'unsafe-eval',
    errorTaming: 'unsafe-debug',
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
