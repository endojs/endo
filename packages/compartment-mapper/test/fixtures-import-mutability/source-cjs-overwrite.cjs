/* eslint-env node */
// CJS module that overwrites module.exports with a new object
module.exports = {
  namedA: 'original',
  namedB: 'original',
  default: 'original',
};

setTimeout(() => {
  // Mutate properties on the module.exports object
  module.exports.namedA = 'mutated';
  module.exports.namedB = 'mutated';
  module.exports.default = 'mutated';
}, 50);
