# HandledPromise

[![dependency status][deps-svg]][deps-url]
[![dev dependency status][dev-deps-svg]][dev-deps-url]
[![License][license-image]][license-url]

Create a HandledPromise class to implement the eventual-send API.  This API is used by the [ECMAScript eventual-send proposal](https://github.com/tc39/proposal-eventual-send).

## How to use

> Note: If you're writing an application, you probably don't want to use this package directly. You'll want to use the eventual-send `~.` operator (tildot) provided in [SES](https://github.com/Agoric/SES) or other platforms.

To install the `HandledPromise` global property shim, do:

```js
import '@agoric/eventual-send/shim';
```

After that, you can use `HandledPromise` in any of your code.  If you need access to the `E` proxy maker, do:

```js
import { E } from '@agoric/eventual-send';
```

[deps-svg]: https://david-dm.org/Agoric/eventual-send.svg
[deps-url]: https://david-dm.org/Agoric/eventual-send
[dev-deps-svg]: https://david-dm.org/Agoric/eventual-send/dev-status.svg
[dev-deps-url]: https://david-dm.org/Agoric/eventual-send?type=dev
[license-image]: https://img.shields.io/badge/License-Apache%202.0-blue.svg
[license-url]: LICENSE
