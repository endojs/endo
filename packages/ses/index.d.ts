/**
 * Transitively freeze an object.
 */
type Harden = <T>(x: T) => T;

declare var harden: Harden;

declare function lockdown(): void;

declare class Compartment {
  constructor(intrinsics?: Record<string, any>);
  evaluate<A = any>(code: string): A;
}
