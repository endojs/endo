/* global globalThis */
console.log(
  'Access properties and methods of O, or an arbitrary object with O(x)',
);

import('@endo/init')
  .then(() => import('./index.js'))
  .then(({ prepareOCell, stripFunction }) => {
    const makeOCell = prepareOCell(null);

    const O = makeOCell(
      Object.assign(
        stripFunction(obj => makeOCell(obj)),
        {
          help: 'This is a help message',
        },
      ),
    );

    globalThis.O = O;
  });
