import { bigint as bigint1, bigint as bigintValue3 } from './bigint.js';

export { stringValue as string1, stringValue as string2 } from './plain.js';

export const bigint3 = bigintValue3;

const tmp = { numberValue: 42 };

const { numberValue: number1, numberValue: numberValue3 } = tmp;

export const { numberValue: number4 } = tmp;

export {
  number1,
  number1 as number2,
  numberValue3 as number3,
  bigint1,
  bigint1 as bigint2,
};
