# `@endo/cjs-module-analyzer`

Static analysis of CommonJS modules to extract exports and dependencies.

This package is a fork of [cjs-module-lexer][] by [Guy Bedford][], which is
used by Node.js proper for analyzing CommonJS modules.

[cjs-module-lexer]: https://github.com/guybedford/cjs-module-lexer
[Guy Bedford]: https://github.com/guybedford

## Overview

This package provides a lexer that statically analyzes CommonJS module source
code to determine:

- **exports**: The names exported by the module
- **reexports**: Modules whose exports are re-exported
- **requires**: The `require()` calls in the module

This is used by [`@endo/compartment-mapper`](../compartment-mapper/README.md)
to build a module graph from CommonJS sources without executing them.

## Usage

```js
import { analyzeCommonJS } from '@endo/cjs-module-analyzer';

const source = `
  const helper = require('./helper.js');
  exports.meaning = 42;
  exports.helper = helper;
`;

const { exports, reexports, requires } = analyzeCommonJS(source, 'my-module.js');
// exports: ['meaning', 'helper']
// reexports: []
// requires: [{ specifier: './helper.js', type: 0 }]
```

## Supported Patterns

The analyzer recognizes various CommonJS export patterns:

### Direct exports

```js
exports.name = value;
module.exports.name = value;
```

### Default export

```js
module.exports = function () {};
module.exports = { a, b, c };
```

### Re-exports

```js
module.exports = require('./other.js');
```

### TypeScript/Babel patterns

```js
__export(require('external'));
__exportStar(require('external'));
tslib.__exportStar(require('external'));
```

### Object.defineProperty exports

```js
Object.defineProperty(exports, 'name', {
  enumerable: true,
  get: function () {
    return module.name;
  },
});
```

### esbuild hints

```js
0 && (module.exports = { a, b, c });
```

## Limitations

This is a lexical analyzer, not a full parser.
It uses heuristics to identify export patterns without building an AST.
Some dynamic patterns cannot be detected:

```js
// Not detected - dynamic property name
const name = 'foo';
exports[name] = value;

// Not detected - indirect assignment
const e = exports;
e.name = value;
```

## License

[Apache-2.0](./LICENSE)
