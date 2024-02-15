export function makeMarshal<Slot>(convertValToSlot?: ConvertValToSlot<Slot> | undefined, convertSlotToVal?: ConvertSlotToVal<Slot> | undefined, { errorTagging, marshalName, errorIdNum, marshalSaveError, serializeBodyFormat, }?: MakeMarshalOptions): {
    toCapData: ToCapData<Slot>;
    fromCapData: FromCapData<Slot>;
    /** @deprecated use toCapData */
    serialize: ToCapData<Slot>;
    /** @deprecated use fromCapData */
    unserialize: FromCapData<Slot>;
};
export type MakeMarshalOptions = import('./types.js').MakeMarshalOptions;
export type ConvertSlotToVal<Slot> = import('./types.js').ConvertSlotToVal<Slot>;
export type ConvertValToSlot<Slot> = import('./types.js').ConvertValToSlot<Slot>;
export type ToCapData<Slot> = import('./types.js').ToCapData<Slot>;
export type FromCapData<Slot> = import('./types.js').FromCapData<Slot>;
export type Passable = import('@endo/pass-style').Passable;
export type InterfaceSpec = import('@endo/pass-style').InterfaceSpec;
export type Encoding = import('./types.js').Encoding;
export type Remotable = import('@endo/pass-style').RemotableObject;
//# sourceMappingURL=marshal.d.ts.map