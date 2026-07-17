(function polyfill() {
  if (typeof globalThis !== 'undefined') {
    globalThis.answerPolyfill = 42;
  } else {
    this.answerPolyfill = 42;
  }
  console.log('answerPolyfill added');
})();
