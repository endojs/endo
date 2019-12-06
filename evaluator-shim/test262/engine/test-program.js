import Evaluator from '../../src/evaluator';
import { applyCorrections } from './corrections';
import { getHarness } from './harness';

export async function test(testInfo) {
  const evaluator = new Evaluator();
  const harness = getHarness(testInfo);
  evaluator.evaluateScript(
    applyCorrections(`${harness}\n${testInfo.contents}`),
  );
}
