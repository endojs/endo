/* global globalThis */
import('./index.js').then(({ prepareOCell }) => {
  const makeOCell = prepareOCell(null);

  const O = makeOCell(
    Object.assign(makeOCell, { help: 'This is a help message' }),
    'O',
  );

  globalThis.O = O;
});
