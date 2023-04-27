/* global setImmediate */
setImmediate(() => {
  throw Error('I am once again throwing an error');
});
throw Error('Shibboleth');
