/**
 * Transitively freeze an object.
 */
type Harden = <T>(x: T) => T;

declare var harden: Harden;

namespace global {
  declare var harden: Harden;
}
