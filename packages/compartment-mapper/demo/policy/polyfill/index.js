(function polyfill() {
  if (typeof globalThis !== 'undefined') {
    // eslint-disable-next-line no-undef
    globalThis.answerPolyfill = 42;
  } else {
    this.answerPolyfill = 42;
  }
  console.log('answerPolyfill added');
})();
