/* global globalThis */
console.log(
  'Access properties and methods of O, or an arbitrary object with O(x)',
);

import('@endo/init')
  .then(() => import('./index.js'))
  .then(({ prepareOTools }) => {
    const { makeO } = prepareOTools(null);

    const O = makeO({
      help: 'This is a help message',
    });

    globalThis.O = O;
  });
