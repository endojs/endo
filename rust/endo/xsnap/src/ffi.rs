//! Raw FFI bindings to the XS JavaScript engine C API.
//!
//! These map directly to the functions declared in xs.h.
//! The macro-based XS API (xsString, xsInteger, etc.) operates on
//! `the->scratch` and `the->stack` — we reimplement those patterns
//! in the safe Rust wrapper.

use std::os::raw::{c_char, c_int, c_void};

/// XS slot — opaque 4-pointer-wide value.
/// Maps to `xsSlotRecord` / `xsSlot` in xs.h.
#[repr(C)]
#[derive(Copy, Clone)]
pub struct XsSlot {
    pub data: [*mut c_void; 4],
}

impl Default for XsSlot {
    fn default() -> Self {
        XsSlot {
            data: [std::ptr::null_mut(); 4],
        }
    }
}

/// XS machine creation parameters.
/// Maps to `xsCreationRecord` in xs.h.
#[repr(C)]
pub struct XsCreation {
    pub initial_chunk_size: i32,
    pub incremental_chunk_size: i32,
    pub initial_heap_count: i32,
    pub incremental_heap_count: i32,
    pub stack_count: i32,
    pub initial_key_count: i32,
    pub incremental_key_count: i32,
    pub name_modulo: i32,
    pub symbol_modulo: i32,
    pub parser_buffer_size: i32,
    pub parser_table_modulo: i32,
    pub static_size: i32,
    pub native_stack_size: i32,
}

/// XS machine record.
/// We access fields through the public layout defined in xs.h.
#[repr(C)]
pub struct XsMachine {
    pub stack: *mut XsSlot,
    pub scope: *mut XsSlot,
    pub frame: *mut XsSlot,
    pub code: *mut u8,
    pub stack_bottom: *mut XsSlot,
    pub stack_top: *mut XsSlot,
    pub stack_intrinsics: *mut XsSlot,
    pub first_jump: *mut c_void, // xsJump*
    pub context: *mut c_void,
    pub archive: *mut c_void,
    pub scratch: XsSlot,
    pub stack_prototypes: *mut XsSlot,
    pub exit_status: c_int,
    // Platform fields (mxMachinePlatform)
    pub promise_jobs: c_int,
    pub timer_jobs: *mut c_void,
    pub host: *mut c_void,
}

/// XS callback function signature.
pub type XsCallback = unsafe extern "C" fn(the: *mut XsMachine);

/// XS identifier type.
pub type XsIdentifier = i32;

/// Slot type constants from xs.h enum.
pub const XS_UNDEFINED_TYPE: i8 = 0;
pub const XS_NULL_TYPE: i8 = 1;
pub const XS_BOOLEAN_TYPE: i8 = 2;
pub const XS_INTEGER_TYPE: i8 = 3;
pub const XS_NUMBER_TYPE: i8 = 4;
pub const XS_STRING_TYPE: i8 = 5;
pub const XS_STRING_X_TYPE: i8 = 6;
pub const XS_SYMBOL_TYPE: i8 = 7;
pub const XS_BIGINT_TYPE: i8 = 8;
pub const XS_BIGINT_X_TYPE: i8 = 9;
pub const XS_REFERENCE_TYPE: i8 = 10;

/// The sentinel "no ID" value.
pub const XS_NO_ID: XsIdentifier = -1;

/// XS_FRAME_COUNT — number of slots in a call frame.
/// From xs.h: `#define XS_FRAME_COUNT 6`
pub const XS_FRAME_COUNT: i32 = 6;

extern "C" {
    // Machine lifecycle
    pub fn fxCreateMachine(
        creation: *const XsCreation,
        name: *const c_char,
        context: *mut c_void,
        archive: XsIdentifier,
    ) -> *mut XsMachine;

    pub fn fxDeleteMachine(the: *mut XsMachine);

    // Host entry/exit (for calling into JS from C/Rust)
    pub fn fxBeginHost(the: *mut XsMachine) -> *mut XsMachine;
    pub fn fxEndHost(the: *mut XsMachine);

    // Stack overflow check
    pub fn fxOverflow(
        the: *mut XsMachine,
        count: c_int,
        file: *const c_char,
        line: c_int,
    );

    // Type inspection
    pub fn fxTypeOf(the: *mut XsMachine, slot: *mut XsSlot) -> i8;
    pub fn fxIsCallable(the: *mut XsMachine, slot: *mut XsSlot) -> i32;

    // Primitive constructors — write into a slot
    pub fn fxUndefined(the: *mut XsMachine, slot: *mut XsSlot);
    pub fn fxNull(the: *mut XsMachine, slot: *mut XsSlot);
    pub fn fxBoolean(the: *mut XsMachine, slot: *mut XsSlot, value: i32);
    pub fn fxInteger(the: *mut XsMachine, slot: *mut XsSlot, value: i32);
    pub fn fxNumber(the: *mut XsMachine, slot: *mut XsSlot, value: f64);
    pub fn fxString(
        the: *mut XsMachine,
        slot: *mut XsSlot,
        value: *const c_char,
    ) -> *mut c_char;
    pub fn fxStringBuffer(
        the: *mut XsMachine,
        slot: *mut XsSlot,
        buffer: *mut c_char,
        size: i32,
    ) -> *mut c_char;
    pub fn fxArrayBuffer(
        the: *mut XsMachine,
        slot: *mut XsSlot,
        buffer: *mut c_void,
        size: i32,
        max_size: i32,
    );

    // Primitive extractors
    pub fn fxToBoolean(the: *mut XsMachine, slot: *mut XsSlot) -> i32;
    pub fn fxToInteger(the: *mut XsMachine, slot: *mut XsSlot) -> i32;
    pub fn fxToNumber(the: *mut XsMachine, slot: *mut XsSlot) -> f64;
    pub fn fxToString(
        the: *mut XsMachine,
        slot: *mut XsSlot,
    ) -> *mut c_char;

    // ArrayBuffer access
    pub fn fxGetArrayBufferData(
        the: *mut XsMachine,
        slot: *mut XsSlot,
        offset: i32,
        buffer: *mut c_void,
        size: i32,
    );
    pub fn fxGetArrayBufferLength(
        the: *mut XsMachine,
        slot: *mut XsSlot,
    ) -> i32;
    pub fn fxSetArrayBufferData(
        the: *mut XsMachine,
        slot: *mut XsSlot,
        offset: i32,
        buffer: *mut c_void,
        size: i32,
    );
    pub fn fxSetArrayBufferLength(
        the: *mut XsMachine,
        slot: *mut XsSlot,
        length: i32,
    );

    // Property access (ID-based)
    // These operate on the top of the stack (TOS):
    //   fxGetID: reads TOS[id], replaces TOS with the value
    //   fxSetID: reads TOS-1[id] = TOS, pops TOS
    //   fxDefineID: defines TOS-1[id] = TOS with flags, pops both
    pub fn fxHasID(the: *mut XsMachine, id: i32) -> i32;
    pub fn fxGetID(the: *mut XsMachine, id: i32);
    pub fn fxSetID(the: *mut XsMachine, id: i32);
    pub fn fxDeleteID(the: *mut XsMachine, id: i32);
    pub fn fxDefineID(
        the: *mut XsMachine,
        id: i32,
        flag: u8,
        mask: u8,
    );

    // Property access (index-based)
    pub fn fxHasIndex(the: *mut XsMachine, index: u32) -> i32;
    pub fn fxGetIndex(the: *mut XsMachine, index: u32);
    pub fn fxSetIndex(the: *mut XsMachine, index: u32);

    // Symbol/ID lookup
    pub fn fxID(the: *mut XsMachine, name: *const c_char) -> i32;
    pub fn fxFindID(the: *mut XsMachine, name: *const c_char) -> i32;
    pub fn fxIsID(the: *mut XsMachine, name: *const c_char) -> i32;
    pub fn fxName(the: *mut XsMachine, id: i32) -> *const c_char;

    // Object operations
    pub fn fxNewObject(the: *mut XsMachine);
    pub fn fxNewArray(the: *mut XsMachine, length: i32);
    pub fn fxNewHostFunction(
        the: *mut XsMachine,
        callback: XsCallback,
        length: i32,
        name: XsIdentifier,
        home: XsIdentifier,
    );
    pub fn fxNewHostObject(
        the: *mut XsMachine,
        destructor: Option<unsafe extern "C" fn(*mut c_void)>,
    );
    pub fn fxGetHostData(
        the: *mut XsMachine,
        slot: *mut XsSlot,
    ) -> *mut c_void;
    pub fn fxSetHostData(
        the: *mut XsMachine,
        slot: *mut XsSlot,
        data: *mut c_void,
    );

    // Call/construct
    pub fn fxCall(the: *mut XsMachine);
    pub fn fxCallID(the: *mut XsMachine, id: i32);
    pub fn fxNew(the: *mut XsMachine);
    pub fn fxRunCount(the: *mut XsMachine, count: i32);

    // Garbage collection
    pub fn fxCollectGarbage(the: *mut XsMachine);
    pub fn fxEnableGarbageCollection(the: *mut XsMachine, enable: i32);

    // Shared cluster (required init/teardown)
    pub fn fxInitializeSharedCluster();
    pub fn fxTerminateSharedCluster();

    // Promise jobs
    pub fn fxRunPromiseJobs(the: *mut XsMachine);
    pub fn fxHasPendingJobs() -> std::os::raw::c_int;

    // Run loop (drains promises + timers until idle)
    pub fn fxRunLoop(the: *mut XsMachine);
    pub fn fxEndJob(the: *mut XsMachine);
    pub fn fxCheckUnhandledRejections(the: *mut XsMachine, at_exit: i32);

    // Debugger
    pub fn fxRunDebugger(the: *mut XsMachine);

    // Metering
    pub fn fxBeginMetering(
        the: *mut XsMachine,
        callback: Option<unsafe extern "C" fn(*mut XsMachine, u32) -> i32>,
        interval: u32,
    );
    pub fn fxEndMetering(the: *mut XsMachine);
}

/// Get the global object slot.
/// Equivalent to the C macro: `xsGlobal` = `the->stackTop[-1]`
///
/// # Safety
/// Caller must ensure `the` is valid.
#[inline]
pub unsafe fn xs_global(the: *mut XsMachine) -> XsSlot {
    *(*the).stack_top.offset(-1)
}

/// Push a slot onto the XS stack.
/// Equivalent to the C macro: `fxPush(_SLOT)` = `*(--the->stack) = _SLOT`
///
/// # Safety
/// Caller must ensure `the` is valid and stack has room.
#[inline]
pub unsafe fn fx_push(the: *mut XsMachine, slot: XsSlot) {
    (*the).stack = (*the).stack.offset(-1);
    *(*the).stack = slot;
}

/// Pop a slot from the XS stack.
/// Equivalent to the C macro: `fxPop()` = `*(the->stack++)`
///
/// # Safety
/// Caller must ensure `the` is valid and stack is not empty.
#[inline]
pub unsafe fn fx_pop(the: *mut XsMachine) -> XsSlot {
    let slot = *(*the).stack;
    (*the).stack = (*the).stack.offset(1);
    slot
}
