/* global setImmediate */
setImmediate(() => {
  Promise.reject(new Error('I am once again throwing an error'));
});
Promise.reject(new Error('Shibboleth'));
