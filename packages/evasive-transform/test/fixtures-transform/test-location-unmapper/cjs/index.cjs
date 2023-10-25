'use strict';

var node_fs = require('node:fs');

/**
 * @returns {import('node:fs').constants.F_OK}
 */
function bambalam() {
  return node_fs.constants.F_OK;
}

/**
 * <!-- this should become less evil -->
 */
function monkey() {
  return true;
}

exports.bambalam = bambalam;
exports.monkey = monkey;
//# sourceMappingURL=index.cjs.map
