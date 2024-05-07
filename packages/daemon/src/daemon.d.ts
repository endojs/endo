export function makeDaemon(powers: DaemonicPowers, daemonLabel: string, cancel: (error: Error) => void, cancelled: Promise<never>, specials?: Specials | undefined): Promise<{
    endoBootstrap: import("@endo/eventual-send").DataOnly<EndoBootstrap> & import("@endo/eventual-send").RemotableBrand<import("@endo/eventual-send").DataOnly<EndoBootstrap>, EndoBootstrap>;
    cancelGracePeriod: (reason: any) => void;
}>;
import type { DaemonicPowers } from './types.js';
import type { Specials } from './types.js';
import type { EndoBootstrap } from './types.js';
//# sourceMappingURL=daemon.d.ts.map