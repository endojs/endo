import { sourceTextCorrections } from './test-configuration';

export function applyCorrections(src) {
  for (const correction of sourceTextCorrections) {
    src = src.replace(...correction);
  }
  return src;
}
