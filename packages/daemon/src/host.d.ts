export function makeHostMaker({ provide, provideController, cancelValue, formulateWorker, formulateHost, formulateGuest, formulateEval, formulateUnconfined, formulateBundle, formulateReadableBlob, getAllNetworkAddresses, makeMailbox, makeDirectoryNode, ownNodeIdentifier, }: {
    provide: import('./types.js').DaemonCore['provide'];
    provideController: import('./types.js').DaemonCore['provideController'];
    cancelValue: import('./types.js').DaemonCore['cancelValue'];
    formulateWorker: import('./types.js').DaemonCore['formulateWorker'];
    formulateHost: import('./types.js').DaemonCore['formulateHost'];
    formulateGuest: import('./types.js').DaemonCore['formulateGuest'];
    formulateEval: import('./types.js').DaemonCore['formulateEval'];
    formulateUnconfined: import('./types.js').DaemonCore['formulateUnconfined'];
    formulateBundle: import('./types.js').DaemonCore['formulateBundle'];
    formulateReadableBlob: import('./types.js').DaemonCore['formulateReadableBlob'];
    getAllNetworkAddresses: import('./types.js').DaemonCore['getAllNetworkAddresses'];
    makeMailbox: import('./types.js').MakeMailbox;
    makeDirectoryNode: import('./types.js').MakeDirectoryNode;
    ownNodeIdentifier: string;
}): (hostId: string, storeId: string, inspectorId: string, mainWorkerId: string, endoId: string, networksDirectoryId: string, leastAuthorityId: string, platformNames: {
    [name: string]: string;
}, context: import('./types.js').Context) => Promise<{
    external: import("@endo/exo/src/types.js").Guarded<{
        followChanges: () => import("@endo/far").FarRef<import("@endo/stream").Reader<import("./types.js").PetStoreNameDiff, undefined>, import("@endo/eventual-send").DataOnly<import("@endo/stream").Reader<import("./types.js").PetStoreNameDiff, undefined>>>;
        followMessages: () => import("@endo/far").FarRef<import("@endo/stream").Reader<import("./types.js").Message, undefined>, import("@endo/eventual-send").DataOnly<import("@endo/stream").Reader<import("./types.js").Message, undefined>>>;
        listMessages: () => Promise<import("./types.js").Message[]>;
        resolve: (messageNumber: number, resolutionName: string) => Promise<void>;
        reject: (messageNumber: number, message?: string | undefined) => Promise<void>;
        adopt: (messageNumber: number, edgeName: string, petName: string) => Promise<void>;
        dismiss: (messageNumber: number) => Promise<void>;
        request: (recipientName: string, what: string, responseName: string) => Promise<unknown>;
        send: (recipientName: string, strings: string[], edgeNames: string[], petNames: string[]) => Promise<void>;
        store(readerRef: import("@endo/eventual-send").ERef<AsyncIterableIterator<string>>, petName: string): Promise<import("./types.js").FarEndoReadable>;
        provideGuest(petName?: string | undefined, opts?: import("./types.js").MakeHostOrGuestOptions | undefined): Promise<import("./types.js").EndoGuest>;
        provideHost(petName?: string | undefined, opts?: import("./types.js").MakeHostOrGuestOptions | undefined): Promise<import("./types.js").EndoHost>;
        makeDirectory(petName: string): Promise<import("./types.js").EndoDirectory>;
        provideWorker(petName: string): Promise<import("./types.js").EndoWorker>;
        evaluate(workerPetName: string | undefined, source: string, codeNames: string[], petNames: string[], resultName?: string | undefined): Promise<unknown>;
        /** @type {import('./types.js').EndoHost['gateway']} */
        makeUnconfined(workerName: string, specifier: string, powersName: string, resultName?: string | undefined): Promise<unknown>;
        makeBundle(workerPetName: string | undefined, bundleName: string, powersName: string, resultName?: string | undefined): Promise<unknown>;
        cancel(petName: string, reason: Error): Promise<void>;
        gateway(): Promise<import("./types.js").EndoGateway>;
        getPeerInfo(): Promise<import("./types.js").PeerInfo>;
        addPeerInfo(peerInfo: import("./types.js").PeerInfo): Promise<void>;
        has(...petNamePath: string[]): Promise<boolean>;
        identify(...petNamePath: string[]): Promise<string | undefined>;
        locate(...petNamePath: string[]): Promise<string | undefined>;
        list(...petNamePath: string[]): Promise<string[]>;
        listIdentifiers(...petNamePath: string[]): Promise<string[]>;
        lookup(...petNamePath: string[]): Promise<unknown>;
        reverseLookup(value: unknown): string[];
        /**
         * Attempts to introduce the given names to the specified agent. The agent in question
         * must be formulated before this function is called.
         *
         * @param {string} id - The agent's formula identifier.
         * @param {Record<string,string>} introducedNames - The names to introduce.
         * @returns {Promise<void>}
         */
        write(petNamePath: string[], id: string): Promise<void>;
        remove(...petNamePath: string[]): Promise<void>;
        move(fromPetName: string[], toPetName: string[]): Promise<void>;
        copy(fromPetName: string[], toPetName: string[]): Promise<void>;
    }>;
    internal: {
        receive: (senderId: string, strings: string[], edgeNames: string[], ids: string[], receiverId: string) => void;
        respond: (what: string, responseName: string, senderId: string, senderPetStore: import("./types.js").PetStore, recipientId?: string | undefined) => Promise<unknown>;
        petStore: import("./types.js").PetStore;
    };
}>;
//# sourceMappingURL=host.d.ts.map