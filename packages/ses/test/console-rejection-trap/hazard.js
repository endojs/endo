/* global setImmediate */
setImmediate(() => {
  Promise.reject(new Error('I am once again rejecting with an error'));
});
Promise.reject(new Error('Shibboleth'));
