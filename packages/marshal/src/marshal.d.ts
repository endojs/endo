export function makeMarshal<Slot>(convertValToSlot?: ConvertValToSlot<Slot> | undefined, convertSlotToVal?: ConvertSlotToVal<Slot> | undefined, { errorTagging, marshalName, errorIdNum, marshalSaveError, serializeBodyFormat, }?: MakeMarshalOptions): {
    toCapData: ToCapData<Slot>;
    fromCapData: FromCapData<Slot>;
    /** @deprecated use toCapData */
    serialize: ToCapData<Slot>;
    /** @deprecated use fromCapData */
    unserialize: FromCapData<Slot>;
};
import type { ConvertValToSlot } from './types.js';
import type { ConvertSlotToVal } from './types.js';
import type { MakeMarshalOptions } from './types.js';
import type { ToCapData } from './types.js';
import type { FromCapData } from './types.js';
//# sourceMappingURL=marshal.d.ts.map