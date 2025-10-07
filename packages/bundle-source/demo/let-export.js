let letVal = 'original';
function funcVal() {
  return 'original';
}
class classVal {
  static value = 'original';
}
var varVal = 'original';

const update = () => {
  const errors = [];
  try {
    letVal = 'updated';
  } catch (err) {
    errors.push(err);
  }
  try {
    funcVal = function () {
      return 'updated';
    };
  } catch (err) {
    errors.push(err);
  }
  try {
    classVal = class {
      static value = 'updated';
    };
  } catch (err) {
    errors.push(err);
  }
  try {
    varVal = 'updated';
  } catch (err) {
    errors.push(err);
  }

  return errors;
};

export const constErrorsVal = update();
export const constValFromLet = letVal;
export const constValFromFunc = funcVal;
export const constValFromClass = classVal;
export const constValFromVar = varVal;
export { letVal, funcVal, classVal, varVal };
