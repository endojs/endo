export function makeDaemon(powers: import('./types.js').DaemonicPowers, daemonLabel: string, cancel: (error: Error) => void, cancelled: Promise<never>): Promise<{
    endoBootstrap: import("@endo/eventual-send").DataOnly<{
        ping: () => Promise<string>;
        terminate: () => Promise<void>;
        host: () => Promise<import("./types.js").EndoHost>;
        leastAuthority: () => Promise<import("./types.js").EndoGuest>;
        webPageJs: () => Promise<unknown>;
        importAndEndowInWebPage: () => Promise<void>;
    }> & import("@endo/eventual-send").RemotableBrand<import("@endo/eventual-send").DataOnly<{
        ping: () => Promise<string>;
        terminate: () => Promise<void>;
        host: () => Promise<import("./types.js").EndoHost>;
        leastAuthority: () => Promise<import("./types.js").EndoGuest>;
        webPageJs: () => Promise<unknown>;
        importAndEndowInWebPage: () => Promise<void>;
    }>, {
        ping: () => Promise<string>;
        terminate: () => Promise<void>;
        host: () => Promise<import("./types.js").EndoHost>;
        leastAuthority: () => Promise<import("./types.js").EndoGuest>;
        webPageJs: () => Promise<unknown>;
        importAndEndowInWebPage: () => Promise<void>;
    }>;
    cancelGracePeriod: (reason: any) => void;
    assignWebletPort: (value: import("@endo/promise-kit").ERef<number>) => void;
}>;
//# sourceMappingURL=daemon.d.ts.map