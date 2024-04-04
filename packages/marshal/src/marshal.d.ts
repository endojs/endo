export function makeMarshal<Slot>(convertValToSlot?: ConvertValToSlot<Slot> | undefined, convertSlotToVal?: ConvertSlotToVal<Slot> | undefined, { errorTagging, marshalName, errorIdNum, marshalSaveError, serializeBodyFormat, }?: MakeMarshalOptions): {
    toCapData: ToCapData<Slot>;
    fromCapData: FromCapData<Slot>;
    /** @deprecated use toCapData */
    serialize: ToCapData<Slot>;
    /** @deprecated use fromCapData */
    unserialize: FromCapData<Slot>;
};
export type ConvertSlotToVal<Slot> = import('./types.js').ConvertSlotToVal<Slot>;
export type ConvertValToSlot<Slot> = import('./types.js').ConvertValToSlot<Slot>;
export type ToCapData<Slot> = import('./types.js').ToCapData<Slot>;
export type FromCapData<Slot> = import('./types.js').FromCapData<Slot>;
import type { MakeMarshalOptions } from './types.js';
//# sourceMappingURL=marshal.d.ts.map