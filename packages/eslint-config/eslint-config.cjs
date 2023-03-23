// Used only by external packages that want an opinionated coding style with
// Endo sensibilities.
module.exports = {
  extends: [
    // Prettier plugin for compatibility.  Packages that just want to use the
    // endo strict config can do so directly.
    'plugin:prettier/recommended',
    'plugin:@jessie.js/recommended',
    'plugin:@endo/strict',
  ],
  ignorePatterns: [
    '**/output/**',
    '**/bundles/**',
    '**/coverage/**',
    '**/dist/**',
  ],
};
