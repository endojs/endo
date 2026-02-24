import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

export const make = () => {
  return makeExo(
    'ShimChecker',
    M.interface('ShimChecker', {}, { defaultGuards: 'passable' }),
    {
      wasShimmed() {
        return Reflect.testShimExecuted === true;
      },
    },
  );
};
