In a Node.js repl, after running `npm install ses`:

```js
const SES = require('ses');
const s = SES.makeSESRootRealm({consoleMode: 'allow', errorStackMode: 'allow'});
// NOTE: errorStackMode enables confinement breach, do not leave on in production
s.evaluate('1+2'); // returns 3
s.evaluate('1+a', {a: 3}); // returns 4
function double(a) {
  return a*2;
}
const doubler = s.evaluate(`(${double})`);
doubler(3); // returns 6
```

To use SES in a browser environment, use your favorite packaging/bundler tool to get `ses` from NPM. Or, to do it manually, clone the SES source tree and run `npm run-script build`, which will create `dist/ses.umd.js`. Copy this into your HTTP server's directory somewhere, then reference that URL from an HTML page's `<head>` section (see demo/ for something functional), to add an `SES` symbol to the global scope. It will look something vaguely like this:
```html
<script src=".../dist/ses.umd.js"></script>
```

After that loads (e.g. in a `<script>` tag at the end of the `<body>`), the following code should work:

```js
const s = SES.makeSESRootRealm(...);
s.evaluate(...);
```

Note that the Realm shim currently requires either the Node.js `vm` module, or a browser's `<iframe>` element (it does `document.createElement('iframe')`), so it won't work in a DOM-less `WebWorker`, `SharedWorker`, or `ServiceWorker`. If/when the Realms proposal becomes a standard part of Javascript, these environments ought to have a native `Realm` object available, and SES should work in all of them.
