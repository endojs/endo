/* eslint-env node */
// CJS module that uses exports.* without overwriting module.exports
exports.namedA = 'original';
exports.namedB = 'original';
exports.default = 'original';

setTimeout(() => {
  exports.namedA = 'mutated';
  exports.namedB = 'mutated';
  exports.default = 'mutated';
}, 50);
