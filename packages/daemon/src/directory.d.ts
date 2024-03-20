export function makeDirectoryMaker({ provide, getIdForRef, formulateDirectory, }: {
    provide: import('./types.js').DaemonCore['provide'];
    getIdForRef: import('./types.js').DaemonCore['getIdForRef'];
    formulateDirectory: import('./types.js').DaemonCore['formulateDirectory'];
}): {
    makeIdentifiedDirectory: ({ petStoreId, context }: {
        petStoreId: string;
        context: import('./types.js').Context;
    }) => Promise<{
        external: {
            followChanges: () => import("@endo/far").FarRef<import("@endo/stream").Reader<import("./types.js").PetStoreNameDiff, undefined>, import("@endo/eventual-send").DataOnly<import("@endo/stream").Reader<import("./types.js").PetStoreNameDiff, undefined>>>;
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
        internal: {};
    }>;
    makeDirectoryNode: import("./types.js").MakeDirectoryNode;
};
//# sourceMappingURL=directory.d.ts.map