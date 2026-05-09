// The simulator is a browser/worker-only experimental package; the
// strict SES library lint preset doesn't apply. We use a minimal config
// that knows about browser and worker globals.
module.exports = {
  root: true,
  env: {
    browser: true,
    worker: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {},
};
