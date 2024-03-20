export function makeGuestMaker({ provide, provideControllerAndResolveHandle, makeMailbox, makeDirectoryNode, }: {
    provide: import('./types.js').DaemonCore['provide'];
    provideControllerAndResolveHandle: import('./types.js').DaemonCore['provideControllerAndResolveHandle'];
    makeMailbox: import('./types.js').MakeMailbox;
    makeDirectoryNode: import('./types.js').MakeDirectoryNode;
}): (guestId: string, hostHandleId: string, petStoreId: string, mainWorkerId: string, context: import('./types.js').Context) => Promise<{
    external: {
        followChanges: () => import("@endo/far").FarRef<import("@endo/stream").Reader<import("./types.js").PetStoreNameDiff, undefined>, import("@endo/eventual-send").DataOnly<import("@endo/stream").Reader<import("./types.js").PetStoreNameDiff, undefined>>>;
        followMessages: () => import("@endo/far").FarRef<import("@endo/stream").Reader<import("./types.js").Message, undefined>, import("@endo/eventual-send").DataOnly<import("@endo/stream").Reader<import("./types.js").Message, undefined>>>;
        listMessages: () => Promise<import("./types.js").Message[]>;
        resolve: (messageNumber: number, resolutionName: string) => Promise<void>;
        reject: (messageNumber: number, message?: string | undefined) => Promise<void>;
        adopt: (messageNumber: number, edgeName: string, petName: string) => Promise<void>;
        dismiss: (messageNumber: number) => Promise<void>;
        request: (recipientName: string, what: string, responseName: string) => Promise<unknown>;
        send: (recipientName: string, strings: string[], edgeNames: string[], petNames: string[]) => Promise<void>;
        makeDirectory(petName: string): Promise<import("./types.js").EndoDirectory>;
        has(...petNamePath: string[]): Promise<boolean>;
        identify(...petNamePath: string[]): Promise<string | undefined>;
        list(...petNamePath: string[]): Promise<string[]>;
        listIdentifiers(...petNamePath: string[]): Promise<string[]>;
        lookup(...petNamePath: string[]): Promise<unknown>;
        reverseLookup(value: unknown): string[];
        write(petNamePath: string[], id: any): Promise<void>;
        remove(...petNamePath: string[]): Promise<void>;
        move(fromPetName: string[], toPetName: string[]): Promise<void>;
        copy(fromPetName: string[], toPetName: string[]): Promise<void>;
    } & import("@endo/eventual-send").RemotableBrand<{}, {
        followChanges: () => import("@endo/far").FarRef<import("@endo/stream").Reader<import("./types.js").PetStoreNameDiff, undefined>, import("@endo/eventual-send").DataOnly<import("@endo/stream").Reader<import("./types.js").PetStoreNameDiff, undefined>>>;
        followMessages: () => import("@endo/far").FarRef<import("@endo/stream").Reader<import("./types.js").Message, undefined>, import("@endo/eventual-send").DataOnly<import("@endo/stream").Reader<import("./types.js").Message, undefined>>>;
        listMessages: () => Promise<import("./types.js").Message[]>;
        resolve: (messageNumber: number, resolutionName: string) => Promise<void>;
        reject: (messageNumber: number, message?: string | undefined) => Promise<void>;
        adopt: (messageNumber: number, edgeName: string, petName: string) => Promise<void>;
        dismiss: (messageNumber: number) => Promise<void>;
        request: (recipientName: string, what: string, responseName: string) => Promise<unknown>;
        send: (recipientName: string, strings: string[], edgeNames: string[], petNames: string[]) => Promise<void>;
        makeDirectory(petName: string): Promise<import("./types.js").EndoDirectory>;
        has(...petNamePath: string[]): Promise<boolean>;
        identify(...petNamePath: string[]): Promise<string | undefined>;
        list(...petNamePath: string[]): Promise<string[]>;
        listIdentifiers(...petNamePath: string[]): Promise<string[]>;
        lookup(...petNamePath: string[]): Promise<unknown>;
        reverseLookup(value: unknown): string[];
        write(petNamePath: string[], id: any): Promise<void>;
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
//# sourceMappingURL=guest.d.ts.map