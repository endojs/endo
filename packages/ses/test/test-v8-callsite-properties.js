import test from 'ava';
import '../index.js';

lockdown({ errorTaming: 'unsafe' });

test('callSite properties', t => {
  function topFrame() {
    let sst;
    const orig = Error.prepareStackTrace;
    try {
      const pst = (_err, sst0) => {
        sst = sst0;
        return '';
      };
      Error.prepareStackTrace = pst;
      const e = Error();
      // eslint-disable-next-line no-void
      void e.stack;
    } finally {
      Error.prepareStackTrace = orig;
    }
    // TODO: if we're not under v8, 'sst' will be undefined or an empty
    // string, and we shouldn't look for these properties. This test checks
    // what happens if we *are* under v8.
    return sst[0];
  }
  const top = topFrame();

  // We currently expect unsafe-tamed Error to allow prepareStackTrace to
  // see the following properties, most of which violate confidentiality of
  // the code that threw the exception and everybody on the stack below
  // them. But we hide the properties that would violate integrity, like
  // `getThis` and `getFunction`.
  t.is(top.getTypeName(), null);
  t.is(top.getFunctionName(), 'topFrame');
  t.is(top.getMethodName(), null);
  t.is(typeof top.getFileName(), 'string');
  t.is(typeof top.getLineNumber(), 'number');
  t.is(typeof top.getColumnNumber(), 'number');
  t.is(top.getEvalOrigin(), undefined);
  t.is(top.isToplevel(), true);
  t.is(top.isNative(), false);
  t.is(typeof top.getPosition(), 'number');
  t.is(typeof top.getScriptNameOrSourceURL(), 'string');
});
