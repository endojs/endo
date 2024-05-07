export function makeDirectoryMaker({ provide, getIdForRef, getTypeForId, formulateDirectory, }: {
    provide: import("./types.js").Provide;
    getIdForRef: (ref: unknown) => string | undefined;
    getTypeForId: (id: string) => Promise<string>;
    formulateDirectory: () => import("./types.js").FormulateResult<EndoDirectory>;
}): {
    makeIdentifiedDirectory: ({ petStoreId, context }: {
        petStoreId: string;
        context: Context;
    }) => Promise<import("@endo/exo").Guarded<{
        /** @param {string} locator */
        followLocatorNameChanges: (locator: string) => import("@endo/eventual-send").FarRef<import("@endo/stream").Reader<LocatorNameChange>>;
        followNameChanges: () => import("@endo/eventual-send").FarRef<import("@endo/stream").Reader<import("./types.js").PetStoreNameChange>>;
        makeDirectory(petName: string): Promise<EndoDirectory>;
        has(...petNamePath: string[]): Promise<boolean>;
        identify(...petNamePath: string[]): Promise<string | undefined>;
        locate(...petNamePath: string[]): Promise<string | undefined>;
        reverseLocate(locator: string): Promise<string[]>;
        list(...petNamePath: string[]): Promise<string[]>;
        listIdentifiers(...petNamePath: string[]): Promise<string[]>;
        lookup(...petNamePath: string[]): Promise<unknown>;
        reverseLookup(value: unknown): string[];
        write(petNamePath: string[], id: string): Promise<void>;
        remove(...petNamePath: string[]): Promise<void>;
        move(fromPetName: string[], toPetName: string[]): Promise<void>;
        copy(fromPetName: string[], toPetName: string[]): Promise<void>;
    }>>;
    makeDirectoryNode: MakeDirectoryNode;
};
import type { EndoDirectory } from './types.js';
import type { Context } from './types.js';
import type { LocatorNameChange } from './types.js';
import type { MakeDirectoryNode } from './types.js';
//# sourceMappingURL=directory.d.ts.map