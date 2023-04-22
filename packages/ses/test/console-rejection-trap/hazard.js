/* global setImmediate */
setImmediate(() => {
  Promise.reject(Error('I am once again rejecting with an error'));
});
Promise.reject(Error('Shibboleth'));
