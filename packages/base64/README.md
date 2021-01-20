# base64

Base64 is a JavaScript package that encodes and decodes
[Base64](https://en.wikipedia.org/wiki/Base64) between strings and
`Uint8Array`s.

Base64 exports TypeScript definitions and is suitable for both web and Node.js.

## Install

```sh
npm install @endo/base64
```

## Usage

```js
import { encodeBase64, decodeBase64 } from '@endo/base64';

const string = encodeBase64(bytes);
const bytes = decodeBase64(string);
```
