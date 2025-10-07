let letVal = 'original';

const update = () => {
  letVal = 'updated';
  return 42;
};

export const constVal = update();
export const constValFromLet = letVal;
// Comment next line to avoid 'ReferenceError: letVal is not defined' as simulated by `strict-scope-terminator.js`
export { letVal };
