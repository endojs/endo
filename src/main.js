const esmExports = require('esm')(module)('./index.js');

module.exports = Object.assign(esmExports.default, esmExports);
