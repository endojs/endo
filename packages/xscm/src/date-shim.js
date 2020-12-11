globalThis.Date = {
  ...Date,
  now() { return 0 }
};
