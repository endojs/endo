Getting Started
===============================

SES is a `JavaScript package <https://www.npmjs.com/package/ses>`_
that allows you to run third-party code safely. It runs in Node.js and
in the browser.

Installing SES
---------------

In Node.js:

.. code:: js

  npm install ses

In the browser:

.. code:: html

   <script src="https://unpkg.com/ses"></script>


Try it out
-----------

In a Node.js repl, after running ``npm install ses``:

.. code:: js

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

In the browser after loading SES:

.. code:: js

   const s = SES.makeSESRootRealm(...);
   s.evaluate(...);

Bundlers
----------

SES works with the main bundlers such as Webpack, Browserify, Rollup,
and Parcel. Simply install SES using npm and ``require`` or ``import`` it.

Building from scratch
-----------------------

Clone the `SES repo <https://github.com/Agoric/SES>`_ and run ``npm
run-script build``, which will create a variety of files under
``dist/``. ``ses.cjs.js`` is the CommonJS version of SES, ``ses.esm.js``
is the ES6 module version, and ``ses.umd.js`` is the UMD version
intended for the browser. 

Webworkers
-----------

Note that the Realm shim currently requires either the Node.js ``vm``
module, or a browser’s ``<iframe>`` element (it does
``document.createElement('iframe')``), so it won’t work in a DOM-less
``WebWorker``, ``SharedWorker``, or ``ServiceWorker``. If/when the
Realms proposal becomes a standard part of Javascript, these
environments ought to have a native ``Realm`` object available, and SES
should work in all of them.
