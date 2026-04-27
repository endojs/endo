// @ts-check
/**
 * Layout constants for the rpc.capnp messages we encode and decode.
 *
 * These match `c++/src/capnp/rpc.capnp` from the Cap'n Proto upstream
 * (schema id @0xb312981b2552a250). Field ordinals and slot offsets here are
 * the source of truth for our hand-written codecs in the rest of this
 * directory; bytes on the wire match what the C++ reference would produce
 * for the same logical content.
 */

/** Top-level Message union discriminator slot (uint16 at byte 0). */
export const MESSAGE_TAG_BYTE_OFFSET = 0;

/** Message data section size in words. */
export const MESSAGE_DATA_WORDS = 1;
/** Message has 1 pointer slot pointing at the variant struct. */
export const MESSAGE_PTR_WORDS = 1;

/** Message union ordinals (per rpc.capnp, line ~30). */
export const MSG_UNIMPLEMENTED = 0;
export const MSG_ABORT = 1;
export const MSG_CALL = 2;
export const MSG_RETURN = 3;
export const MSG_FINISH = 4;
export const MSG_RESOLVE = 5;
export const MSG_RELEASE = 6;
export const MSG_OBSOLETE_SAVE = 7;
export const MSG_BOOTSTRAP = 8;
export const MSG_OBSOLETE_DELETE = 9;
export const MSG_PROVIDE = 10;
export const MSG_ACCEPT = 11;
export const MSG_JOIN = 12;
export const MSG_DISEMBARGO = 13;

export const MSG_NAMES = [
  'unimplemented',
  'abort',
  'call',
  'return',
  'finish',
  'resolve',
  'release',
  'obsoleteSave',
  'bootstrap',
  'obsoleteDelete',
  'provide',
  'accept',
  'join',
  'disembargo',
];

/* ===== Bootstrap ===== */
/** uint64 questionId @ 0; AnyPointer deprecatedObjectId @ pointer 0. */
export const BOOTSTRAP_DATA_WORDS = 1;
export const BOOTSTRAP_PTR_WORDS = 1;
export const BOOTSTRAP_QUESTION_ID = 0; // byte offset

/* ===== Call ===== */
/**
 * struct Call @0x836a53ce789d4cd4 { # 24 bytes, 3 ptrs
 *   questionId      @0  :UInt32;  bits[0, 32)
 *   target          @1  :MessageTarget;  ptr[0]
 *   interfaceId     @2  :UInt64;  bits[64, 128)
 *   methodId        @3  :UInt16;  bits[32, 48)  (placed in 4-byte hole)
 *   allowThirdPartyTailCall @8 :Bool = false;  bit[128, 129) = byte 16 bit 0
 *   noPromisePipelining @9 :Bool = false;      bit 129
 *   onlyPromisePipeline @10:Bool = false;      bit 130
 *   params          @4  :Payload;  ptr[1]
 *   sendResultsTo   :group {
 *     union { tag bits[48, 64) = byte 6 word 0:
 *       caller     @5  :Void;
 *       yourself   @6  :Void;
 *       thirdParty @7  :AnyPointer;  ptr[2]
 *     }
 *   }
 * }
 */
export const CALL_DATA_WORDS = 3;
export const CALL_PTR_WORDS = 3;
export const CALL_QUESTION_ID_BO = 0; // uint32
export const CALL_METHOD_ID_BO = 4; // uint16 (placed in hole at byte 4)
export const CALL_SEND_RESULTS_TO_TAG_BO = 6; // uint16 union tag at byte 6
export const CALL_INTERFACE_ID_BO = 8; // uint64
export const CALL_ALLOW_3PTY_TAIL_BIT = 16 * 8 + 0; // bit @ byte 16 bit 0
export const CALL_PTR_TARGET = 0;
export const CALL_PTR_PARAMS = 1;
export const CALL_PTR_SEND_RESULTS_TO_DATA = 2; // for thirdParty variant

/* ===== Call.sendResultsTo discriminator (group is inline; we use byte 18) ===== */
export const CALL_SRT_CALLER = 0;
export const CALL_SRT_YOURSELF = 1;
export const CALL_SRT_THIRD_PARTY = 2;

/* ===== MessageTarget ===== */
export const TARGET_DATA_WORDS = 1;
export const TARGET_PTR_WORDS = 1;
export const TARGET_TAG_BO = 4; // uint16 union tag at byte 4
export const TARGET_IMPORTED_CAP_ID_BO = 0; // uint32 (when tag=0)
export const TARGET_PTR_PROMISED_ANSWER = 0; // (when tag=1)
export const TARGET_TAG_IMPORTED_CAP = 0;
export const TARGET_TAG_PROMISED_ANSWER = 1;

/* ===== PromisedAnswer ===== */
export const PA_DATA_WORDS = 1;
export const PA_PTR_WORDS = 1;
export const PA_QUESTION_ID_BO = 0; // uint32
export const PA_PTR_TRANSFORM = 0; // List(PromisedAnswer.Op)

/* ===== PromisedAnswer.Op ===== */
export const PA_OP_DATA_WORDS = 1;
export const PA_OP_PTR_WORDS = 0;
export const PA_OP_TAG_BO = 0; // uint16 tag
export const PA_OP_FIELD_BO = 2; // uint16 field ordinal (when tag=1)
export const PA_OP_TAG_NOOP = 0;
export const PA_OP_TAG_GET_POINTER_FIELD = 1;

/* ===== Payload ===== */
export const PAYLOAD_DATA_WORDS = 0;
export const PAYLOAD_PTR_WORDS = 2;
export const PAYLOAD_PTR_CONTENT = 0; // AnyPointer
export const PAYLOAD_PTR_CAP_TABLE = 1; // List(CapDescriptor)

/* ===== CapDescriptor ===== */
export const CAPDESC_DATA_WORDS = 1;
export const CAPDESC_PTR_WORDS = 1;
export const CAPDESC_TAG_BO = 0; // uint16 union tag
export const CAPDESC_ID_BO = 4; // uint32 (id used by senderHosted, senderPromise, receiverHosted)
export const CAPDESC_PTR_RECEIVER_ANSWER = 0; // PromisedAnswer
export const CAPDESC_PTR_THIRD_PARTY = 0; // ThirdPartyCapDescriptor (re-uses pointer slot)
export const CAPDESC_TAG_NONE = 0;
export const CAPDESC_TAG_SENDER_HOSTED = 1;
export const CAPDESC_TAG_SENDER_PROMISE = 2;
export const CAPDESC_TAG_RECEIVER_HOSTED = 3;
export const CAPDESC_TAG_RECEIVER_ANSWER = 4;
export const CAPDESC_TAG_THIRD_PARTY = 5;

/* ===== ThirdPartyCapDescriptor ===== */
export const TPCD_DATA_WORDS = 1;
export const TPCD_PTR_WORDS = 1;
export const TPCD_VINE_ID_BO = 0; // uint32
export const TPCD_PTR_ID = 0; // ThirdPartyCapId (AnyPointer / network specific)

/* ===== Return ===== */
export const RETURN_DATA_WORDS = 2;
export const RETURN_PTR_WORDS = 1;
export const RETURN_ANSWER_ID_BO = 0; // uint32
export const RETURN_RELEASE_PARAM_CAPS_BIT = 4 * 8 + 0; // bit @ byte 4 bit 0
export const RETURN_TAG_BO = 6; // uint16 union tag at byte 6
export const RETURN_PTR_RESULTS = 0; // Payload (when tag=results)
export const RETURN_PTR_EXCEPTION = 0; // Exception (when tag=exception)
export const RETURN_TAKE_FROM_OTHER_QUESTION_ID_BO = 8; // uint32 (when tag=takeFromOtherQuestion)
export const RETURN_PTR_ACCEPT_FROM_THIRD_PARTY = 0;
export const RETURN_TAG_RESULTS = 0;
export const RETURN_TAG_EXCEPTION = 1;
export const RETURN_TAG_CANCELED = 2;
export const RETURN_TAG_RESULTS_SENT_ELSEWHERE = 3;
export const RETURN_TAG_TAKE_FROM_OTHER_QUESTION = 4;
export const RETURN_TAG_ACCEPT_FROM_THIRD_PARTY = 5;

/* ===== Finish ===== */
export const FINISH_DATA_WORDS = 1;
export const FINISH_PTR_WORDS = 0;
export const FINISH_QUESTION_ID_BO = 0; // uint32
export const FINISH_RELEASE_RESULT_CAPS_BIT = 4 * 8 + 0;
export const FINISH_REQUIRE_EARLY_CANCELLATION_BIT = 4 * 8 + 1;

/* ===== Resolve ===== */
export const RESOLVE_DATA_WORDS = 1;
export const RESOLVE_PTR_WORDS = 1;
export const RESOLVE_PROMISE_ID_BO = 0; // uint32
export const RESOLVE_TAG_BO = 4; // uint16
export const RESOLVE_PTR_CAP = 0; // CapDescriptor (when tag=cap)
export const RESOLVE_PTR_EXCEPTION = 0; // Exception (when tag=exception)
export const RESOLVE_TAG_CAP = 0;
export const RESOLVE_TAG_EXCEPTION = 1;

/* ===== Release ===== */
export const RELEASE_DATA_WORDS = 1;
export const RELEASE_PTR_WORDS = 0;
export const RELEASE_ID_BO = 0; // uint32
export const RELEASE_REF_COUNT_BO = 4; // uint32

/* ===== Disembargo ===== */
/**
 * struct Disembargo { # 8 bytes, 1 ptrs
 *   target @0 :MessageTarget; ptr[0]
 *   context :group {
 *     union { tag bits[32, 48) = byte 4
 *       senderLoopback @1 :UInt32;  bits[0, 32) = byte 0
 *       receiverLoopback @2 :UInt32; bits[0, 32)
 *       accept @3 :Void;
 *       provide @4 :UInt32;
 *     }
 *   }
 * }
 */
export const DISEMBARGO_DATA_WORDS = 1;
export const DISEMBARGO_PTR_WORDS = 1;
export const DISEMBARGO_CTX_TAG_BO = 4; // uint16 discriminator at byte 4
export const DISEMBARGO_CTX_VALUE_BO = 0; // uint32 value at byte 0
export const DISEMBARGO_PTR_TARGET = 0; // MessageTarget
export const DISEMBARGO_CTX_SENDER_LOOPBACK = 0;
export const DISEMBARGO_CTX_RECEIVER_LOOPBACK = 1;
export const DISEMBARGO_CTX_ACCEPT = 2;
export const DISEMBARGO_CTX_PROVIDE = 3;

/* ===== Provide ===== */
export const PROVIDE_DATA_WORDS = 1;
export const PROVIDE_PTR_WORDS = 2;
export const PROVIDE_QUESTION_ID_BO = 0; // uint32
export const PROVIDE_PTR_TARGET = 0;
export const PROVIDE_PTR_RECIPIENT = 1;

/* ===== Accept ===== */
export const ACCEPT_DATA_WORDS = 1;
export const ACCEPT_PTR_WORDS = 1;
export const ACCEPT_QUESTION_ID_BO = 0; // uint32
export const ACCEPT_EMBARGO_BIT = 4 * 8 + 0; // bit @ byte 4 bit 0
export const ACCEPT_PTR_PROVISION = 0;

/* ===== Unimplemented (carries a Message). ===== */
export const UNIMPL_DATA_WORDS = 0;
export const UNIMPL_PTR_WORDS = 1;
export const UNIMPL_PTR_MESSAGE = 0;

/* ===== Abort -> Exception ===== */
export const ABORT_DATA_WORDS = 0;
export const ABORT_PTR_WORDS = 1;
export const ABORT_PTR_EXCEPTION = 0;

/* ===== Exception ===== */
export const EXCEPTION_DATA_WORDS = 1;
export const EXCEPTION_PTR_WORDS = 1;
export const EXCEPTION_PTR_REASON = 0;
export const EXCEPTION_TYPE_BO = 4; // uint16
export const EXCEPTION_TYPE_FAILED = 0;
export const EXCEPTION_TYPE_OVERLOADED = 1;
export const EXCEPTION_TYPE_DISCONNECTED = 2;
export const EXCEPTION_TYPE_UNIMPLEMENTED = 3;
