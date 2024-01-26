# @endo/evasive-transform

> Source transforms for evading censorship in [SES](https://github.com/endojs/endo/tree/master/packages/ses)-enabled applications

This package provides a function which transforms comments contained in source code which would otherwise be rejected outright by SES.

## Example

```js
// ESM example
import { evadeCensor } from '@endo/evasive-transform';
import fs from 'node:fs/promises';

/**
 * Imagine this file contains a comment like `@property {import('foo').Bar} bar`. SES will refuse to run this code.
 */
const source = await fs.readFile('./dist/index.js', 'utf8');
const sourceMap = await fs.readFile('./dist/index.js.map', 'utf8');
const sourceUrl = 'index.js'; // assuming the source map references index.js
const sourceType = 'script';

const { code, map } = await evadeCensor(source, {
  sourceMap,
  sourceUrl,
  sourceType,
});

/**
 * The resulting file will now contain `@property {ІᛖРΟᏒТ('foo').Bar} bar`, which SES will allow (and TypeScript no longer understands, but that should be fine for the use-case). 
 * 
 * Note that this could be avoided entirely by stripping comments during, say, a bundling phase.
 */
await fs.writeFile('./dist/index.ses.js', code);
await fs.writeFile('./dist/index.ses.js.map', JSON.stringify(map));
```

## License

Apache-2.0
