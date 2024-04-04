export function makeDaemon(powers: import('./types.js').DaemonicPowers, daemonLabel: string, cancel: (error: Error) => void, cancelled: Promise<never>, specials?: import("./types.js").Specials | undefined): Promise<{
    endoBootstrap: import("@endo/eventual-send").DataOnly<{
        ping: () => Promise<string>;
        terminate: () => Promise<void>;
        host: () => Promise<import("./types.js").EndoHost>;
        leastAuthority: () => Promise<import("./types.js").EndoGuest>;
        gateway: () => Promise<import("./types.js").EndoGateway>;
        reviveNetworks: () => Promise<void>;
        addPeerInfo: (peerInfo: import("./types.js").PeerInfo) => Promise<void>;
    }> & import("@endo/eventual-send").RemotableBrand<import("@endo/eventual-send").DataOnly<{
        ping: () => Promise<string>;
        terminate: () => Promise<void>;
        host: () => Promise<import("./types.js").EndoHost>;
        leastAuthority: () => Promise<import("./types.js").EndoGuest>;
        gateway: () => Promise<import("./types.js").EndoGateway>;
        reviveNetworks: () => Promise<void>;
        addPeerInfo: (peerInfo: import("./types.js").PeerInfo) => Promise<void>;
    }>, {
        ping: () => Promise<string>;
        terminate: () => Promise<void>;
        host: () => Promise<import("./types.js").EndoHost>;
        leastAuthority: () => Promise<import("./types.js").EndoGuest>;
        gateway: () => Promise<import("./types.js").EndoGateway>;
        reviveNetworks: () => Promise<void>;
        addPeerInfo: (peerInfo: import("./types.js").PeerInfo) => Promise<void>;
    }>;
    cancelGracePeriod: (reason: any) => void;
}>;
//# sourceMappingURL=daemon.d.ts.map