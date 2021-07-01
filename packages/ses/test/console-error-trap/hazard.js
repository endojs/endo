/* global setImmediate */
setImmediate(() => {
  throw new Error('I am once again throwing an error');
});
throw new Error('Shibboleth');
