import test from 'ava';
import { inferExports } from '../src/infer-exports.js';

function scaffold(cases) {
  const tags = new Set(['node', 'import', 'default']);
  cases.forEach(pkg => {
    test(`infer-exports for ${pkg.name}`, t => {
      const types = {};
      const exports = inferExports(pkg, tags, types);
      t.snapshot({ types, exports });
    });
  });
}

const cases = [
  {
    name: '@floating-ui/dom',
    exports: {
      '.': {
        import: {
          development: './dist/floating-ui.dom.esm.development.js',
          production: './dist/floating-ui.dom.esm.min.js',
          default: './dist/floating-ui.dom.esm.js',
        },
        require: './dist/floating-ui.dom.cjs',
      },
      './package.json': './package.json',
    },
    type: 'module',
    main: 'dist/floating-ui.dom.js',
    module: 'dist/floating-ui.dom.esm.js',
  },
  {
    name: 'underscore',
    main: 'underscore-umd.js',
    module: 'modules/index-all.js',
    type: 'commonjs',
    exports: {
      '.': {
        import: {
          module: './modules/index-all.js',
          browser: {
            production: './underscore-esm-min.js',
            default: './underscore-esm.js',
          },
          node: './underscore-node.mjs',
          default: './underscore-esm.js',
        },
        require: {
          browser: {
            production: './underscore-umd-min.js',
            default: './underscore-umd.js',
          },
          node: './underscore-node.cjs',
          default: './underscore-umd.js',
        },
        default: './underscore-umd.js',
      },
      './underscore*': './underscore*',
      './modules/*': {
        require: './cjs/*',
        default: './modules/*',
      },
      './amd/*': './amd/*',
      './cjs/*': './cjs/*',
      './package.json': './package.json',
    },
  },
  {
    name: 'vue',
    exports: {
      '.': {
        import: {
          node: './index.mjs',
          default: './dist/vue.runtime.esm-bundler.js',
        },
        require: './index.js',
        types: './dist/vue.d.ts',
      },
      './server-renderer': {
        import: './server-renderer/index.mjs',
        require: './server-renderer/index.js',
      },
      './compiler-sfc': {
        import: './compiler-sfc/index.mjs',
        require: './compiler-sfc/index.js',
      },
      './dist/*': './dist/*',
      './package.json': './package.json',
      './macros': './macros.d.ts',
      './macros-global': './macros-global.d.ts',
      './ref-macros': './ref-macros.d.ts',
    },
    main: 'index.js',
    module: 'dist/vue.runtime.esm-bundler.js',
  },
  {
    name: 'socket.io-client',
    exports: {
      './package.json': './package.json',
      './dist/socket.io.js': './dist/socket.io.js',
      './dist/socket.io.js.map': './dist/socket.io.js.map',
      '.': {
        import: {
          node: './build/esm-debug/index.js',
          default: './build/esm/index.js',
        },
        require: './build/cjs/index.js',
        types: './build/esm/index.d.ts',
      },
    },
    type: 'commonjs',
    main: './build/cjs/index.js',
    module: './build/esm/index.js',
    browser: { './test/node.ts': false },
  },
  {
    name: 'babel-plugin-polyfill-es-shims',
    exports: {
      '.': [
        { import: './esm/index.mjs', default: './lib/index.js' },
        './lib/index.js',
      ],
      './package.json': './package.json',
    },
    main: 'lib/index.js',
  },
  {
    name: 'color2k',
    exports: {
      '.': [
        {
          import: './dist/index.exports.import.es.mjs',
          default: './dist/index.exports.require.cjs.js',
        },
        './dist/index.exports.require.cjs.js',
      ],
      './package.json': './package.json',
    },
    main: './dist/index.main.cjs.js',
    module: './dist/index.module.es.js',
  },
  {
    name: '@noble/hashes',
    browser: { crypto: false, './crypto': './cryptoBrowser.js' },
    exports: {
      './index': { import: './esm/index.js', default: './index.js' },
      './crypto': {
        browser: {
          import: './esm/cryptoBrowser.js',
          default: './cryptoBrowser.js',
        },
        import: './esm/crypto.js',
        default: './crypto.js',
      },
      './_sha2': { import: './esm/_sha2.js', default: './_sha2.js' },
      './blake2b': { import: './esm/blake2b.js', default: './blake2b.js' },
      './blake2b.d.ts': 'blake2b.d.ts',
      './blake2s': { import: './esm/blake2s.js', default: './blake2s.js' },
      './blake2s.d.ts': 'blake2s.d.ts',
      './blake3': { import: './esm/blake3.js', default: './blake3.js' },
      './blake3.d.ts': 'blake3.d.ts',
      './eskdf': { import: './esm/eskdf.js', default: './eskdf.js' },
      './eskdf.d.ts': 'eskdf.d.ts',
      './hkdf': { import: './esm/hkdf.js', default: './hkdf.js' },
      './hkdf.d.ts': 'hkdf.d.ts',
      './hmac': { import: './esm/hmac.js', default: './hmac.js' },
      './hmac.d.ts': 'hmac.d.ts',
      './pbkdf2': { import: './esm/pbkdf2.js', default: './pbkdf2.js' },
      './pbkdf2.d.ts': 'pbkdf2.d.ts',
      './ripemd160': {
        import: './esm/ripemd160.js',
        default: './ripemd160.js',
      },
      './ripemd160.d.ts': 'ripemd160.d.ts',
      './scrypt': { import: './esm/scrypt.js', default: './scrypt.js' },
      './scrypt.d.ts': 'scrypt.d.ts',
      './sha3-addons': {
        import: './esm/sha3-addons.js',
        default: './sha3-addons.js',
      },
      './sha3-addons.d.ts': 'sha3-addons.d.ts',
      './sha3': { import: './esm/sha3.js', default: './sha3.js' },
      './sha3.d.ts': 'sha3.d.ts',
      './sha256': { import: './esm/sha256.js', default: './sha256.js' },
      './sha256.d.ts': 'sha256.d.ts',
      './sha512': { import: './esm/sha512.js', default: './sha512.js' },
      './sha512.d.ts': 'sha512.d.ts',
      './utils': { import: './esm/utils.js', default: './utils.js' },
      './utils.d.ts': 'utils.d.ts',
    },
  },
];

scaffold(cases);
