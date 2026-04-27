// @ts-check
/**
 * Encoders and decoders for the rpc.capnp Message union and the directly
 * referenced structs (MessageTarget, PromisedAnswer, Payload, CapDescriptor,
 * ThirdPartyCapDescriptor, Exception). The application's parameters and
 * results live under Payload.content as AnyPointer; we encode them as a
 * pointer to user-owned data (struct or list) supplied via the `body`
 * argument when encoding, and decode them as the resolved struct location.
 *
 * Each top-level encoder returns an ArrayBuffer ready to be framed.
 * Each decoder takes a MessageReader and returns a JS object representing
 * the message variant.
 */

import { Fail } from '@endo/errors';

import { makeMessageBuilder, makeMessageReader } from '../wire/segment.js';
import { frameSegments, unframeSegments } from '../wire/framing.js';
import {
  allocStruct,
  readStructPointer,
  readUint16,
  readUint32,
  readUint64,
  readBool,
  writeUint16,
  writeUint32,
  writeUint64,
  writeBool,
  ptrSlot,
} from '../wire/struct.js';
import {
  allocCompositeList,
  readListPointer,
  compositeElement,
} from '../wire/list.js';
import { writeText, readText, writeData, readData } from '../wire/text.js';
import * as S from './schema.js';

/**
 * Cap'n Proto Bool fields with `= true` defaults are stored XOR'd against 1
 * so that the all-zero data section represents the default. These helpers
 * make the flip explicit at every call site.
 *
 * @param {any} loc
 * @param {number} bitOffset
 * @param {boolean} value
 */
const writeBoolDefaultTrue = (loc, bitOffset, value) =>
  writeBool(loc, bitOffset, !value);
/**
 * @param {any} loc
 * @param {number} bitOffset
 */
const readBoolDefaultTrue = (loc, bitOffset) => !readBool(loc, bitOffset);

/* ===================================================================== *
 *  Helpers
 * ===================================================================== */

const newMessageRoot = () => {
  const msg = makeMessageBuilder();
  // Reserve word 0 as the root pointer slot. Allocate the Message struct as
  // its target.
  const rootSlotAlloc = msg.allocate(1);
  (rootSlotAlloc.segId === 0 && rootSlotAlloc.wordOffset === 0) ||
    Fail`root slot must be segment 0 word 0`;
  const root = allocStruct(
    msg,
    { segId: 0, wordOffset: 0 },
    S.MESSAGE_DATA_WORDS,
    S.MESSAGE_PTR_WORDS,
  );
  return { msg, root };
};

const finalize = msg => frameSegments(msg.finish());

const writeMessageTag = (root, tag) => {
  writeUint16(root, S.MESSAGE_TAG_BYTE_OFFSET, tag);
};

const allocVariant = (msg, root, dataWords, ptrWords) => {
  const slot = ptrSlot(root, 0);
  return allocStruct(msg, slot, dataWords, ptrWords);
};

/* ===================================================================== *
 *  Exception
 * ===================================================================== */

const writeException = (msg, slot, exc) => {
  const e = allocStruct(
    msg,
    slot,
    S.EXCEPTION_DATA_WORDS,
    S.EXCEPTION_PTR_WORDS,
  );
  writeUint16(e, S.EXCEPTION_TYPE_BO, exc.type);
  writeText(msg, ptrSlot(e, S.EXCEPTION_PTR_REASON), exc.reason || '');
};

/** @param {any} loc */
const readException = loc => {
  if (loc === null) return { type: 0, reason: '' };
  return {
    type: readUint16(loc, S.EXCEPTION_TYPE_BO),
    reason:
      readText(
        loc.msg,
        loc.segId,
        loc.wordOffset + loc.dataWords + S.EXCEPTION_PTR_REASON,
      ) || '',
  };
};

/* ===================================================================== *
 *  PromisedAnswer
 * ===================================================================== */

/**
 * @param {any} msg
 * @param {{ segId: number, wordOffset: number }} slot
 * @param {{
 *   questionId: number,
 *   transform?: Array<{ op: string, fieldOrdinal?: number }>,
 * }} pa
 */
const writePromisedAnswer = (msg, slot, pa) => {
  const s = allocStruct(msg, slot, S.PA_DATA_WORDS, S.PA_PTR_WORDS);
  writeUint32(s, S.PA_QUESTION_ID_BO, pa.questionId);
  if (pa.transform && pa.transform.length > 0) {
    const list = allocCompositeList(
      msg,
      ptrSlot(s, S.PA_PTR_TRANSFORM),
      pa.transform.length,
      S.PA_OP_DATA_WORDS,
      S.PA_OP_PTR_WORDS,
    );
    for (let i = 0; i < pa.transform.length; i += 1) {
      const op = pa.transform[i];
      const elem = compositeElement(msg, list, i);
      const opName = String(op.op);
      if (opName === 'noop') {
        writeUint16(elem, S.PA_OP_TAG_BO, S.PA_OP_TAG_NOOP);
      } else if (opName === 'getPointerField') {
        writeUint16(elem, S.PA_OP_TAG_BO, S.PA_OP_TAG_GET_POINTER_FIELD);
        writeUint16(elem, S.PA_OP_FIELD_BO, Number(op.fieldOrdinal));
      } else {
        throw Fail`unknown transform op ${op}`;
      }
    }
  }
};

/** @param {any} loc */
const readPromisedAnswer = loc => {
  const questionId = readUint32(loc, S.PA_QUESTION_ID_BO);
  const list = readListPointer(
    loc.msg,
    loc.segId,
    loc.wordOffset + loc.dataWords + S.PA_PTR_TRANSFORM,
  );
  const transform = [];
  if (list !== null) {
    for (let i = 0; i < list.elemCount; i += 1) {
      const elem = compositeElement(list.msg, list, i);
      const tag = readUint16(elem, S.PA_OP_TAG_BO);
      if (tag === S.PA_OP_TAG_NOOP) {
        transform.push({ op: 'noop' });
      } else if (tag === S.PA_OP_TAG_GET_POINTER_FIELD) {
        transform.push({
          op: 'getPointerField',
          fieldOrdinal: readUint16(elem, S.PA_OP_FIELD_BO),
        });
      } else {
        transform.push({ op: 'unknown', tag });
      }
    }
  }
  return { questionId, transform };
};

/* ===================================================================== *
 *  MessageTarget
 * ===================================================================== */

const writeMessageTarget = (msg, slot, target) => {
  const s = allocStruct(msg, slot, S.TARGET_DATA_WORDS, S.TARGET_PTR_WORDS);
  if (target.kind === 'importedCap') {
    writeUint16(s, S.TARGET_TAG_BO, S.TARGET_TAG_IMPORTED_CAP);
    writeUint32(s, S.TARGET_IMPORTED_CAP_ID_BO, target.id);
  } else if (target.kind === 'promisedAnswer') {
    writeUint16(s, S.TARGET_TAG_BO, S.TARGET_TAG_PROMISED_ANSWER);
    writePromisedAnswer(msg, ptrSlot(s, S.TARGET_PTR_PROMISED_ANSWER), target);
  } else {
    throw Fail`unknown target kind ${target}`;
  }
};

/** @param {any} loc */
const readMessageTarget = loc => {
  if (loc === null) return null;
  const tag = readUint16(loc, S.TARGET_TAG_BO);
  if (tag === S.TARGET_TAG_IMPORTED_CAP) {
    return {
      kind: 'importedCap',
      id: readUint32(loc, S.TARGET_IMPORTED_CAP_ID_BO),
    };
  }
  if (tag === S.TARGET_TAG_PROMISED_ANSWER) {
    const paLoc = readStructPointer(
      loc.msg,
      loc.segId,
      loc.wordOffset + loc.dataWords + S.TARGET_PTR_PROMISED_ANSWER,
    );
    if (paLoc === null) throw Fail`promisedAnswer target with null pointer`;
    return { kind: 'promisedAnswer', ...readPromisedAnswer(paLoc) };
  }
  throw Fail`unknown target tag ${tag}`;
};

/* ===================================================================== *
 *  CapDescriptor
 * ===================================================================== */

const writeCapDescriptor = (msg, structLoc, idx, desc) => {
  // structLoc is a composite-list element of CAPDESC layout.
  if (desc.kind === 'none') {
    writeUint16(structLoc, S.CAPDESC_TAG_BO, S.CAPDESC_TAG_NONE);
    return;
  }
  if (desc.kind === 'senderHosted') {
    writeUint16(structLoc, S.CAPDESC_TAG_BO, S.CAPDESC_TAG_SENDER_HOSTED);
    writeUint32(structLoc, S.CAPDESC_ID_BO, desc.id);
    return;
  }
  if (desc.kind === 'senderPromise') {
    writeUint16(structLoc, S.CAPDESC_TAG_BO, S.CAPDESC_TAG_SENDER_PROMISE);
    writeUint32(structLoc, S.CAPDESC_ID_BO, desc.id);
    return;
  }
  if (desc.kind === 'receiverHosted') {
    writeUint16(structLoc, S.CAPDESC_TAG_BO, S.CAPDESC_TAG_RECEIVER_HOSTED);
    writeUint32(structLoc, S.CAPDESC_ID_BO, desc.id);
    return;
  }
  if (desc.kind === 'receiverAnswer') {
    writeUint16(structLoc, S.CAPDESC_TAG_BO, S.CAPDESC_TAG_RECEIVER_ANSWER);
    writePromisedAnswer(
      msg,
      ptrSlot(structLoc, S.CAPDESC_PTR_RECEIVER_ANSWER),
      desc,
    );
    return;
  }
  if (desc.kind === 'thirdPartyHosted') {
    writeUint16(structLoc, S.CAPDESC_TAG_BO, S.CAPDESC_TAG_THIRD_PARTY);
    const tpcd = allocStruct(
      msg,
      ptrSlot(structLoc, S.CAPDESC_PTR_THIRD_PARTY),
      S.TPCD_DATA_WORDS,
      S.TPCD_PTR_WORDS,
    );
    writeUint32(tpcd, S.TPCD_VINE_ID_BO, desc.vineId);
    writeData(msg, ptrSlot(tpcd, S.TPCD_PTR_ID), desc.thirdPartyCapId);
    return;
  }
  throw Fail`unknown cap descriptor kind ${desc}`;
};

/** @param {any} elem */
const readCapDescriptor = elem => {
  const tag = readUint16(elem, S.CAPDESC_TAG_BO);
  switch (tag) {
    case S.CAPDESC_TAG_NONE:
      return { kind: 'none' };
    case S.CAPDESC_TAG_SENDER_HOSTED:
      return { kind: 'senderHosted', id: readUint32(elem, S.CAPDESC_ID_BO) };
    case S.CAPDESC_TAG_SENDER_PROMISE:
      return { kind: 'senderPromise', id: readUint32(elem, S.CAPDESC_ID_BO) };
    case S.CAPDESC_TAG_RECEIVER_HOSTED:
      return { kind: 'receiverHosted', id: readUint32(elem, S.CAPDESC_ID_BO) };
    case S.CAPDESC_TAG_RECEIVER_ANSWER: {
      const paLoc = readStructPointer(
        elem.msg,
        elem.segId,
        elem.wordOffset + elem.dataWords + S.CAPDESC_PTR_RECEIVER_ANSWER,
      );
      if (paLoc === null) throw Fail`receiverAnswer with null pointer`;
      return { kind: 'receiverAnswer', ...readPromisedAnswer(paLoc) };
    }
    case S.CAPDESC_TAG_THIRD_PARTY: {
      const tpcdLoc = readStructPointer(
        elem.msg,
        elem.segId,
        elem.wordOffset + elem.dataWords + S.CAPDESC_PTR_THIRD_PARTY,
      );
      if (tpcdLoc === null) throw Fail`thirdParty with null pointer`;
      const id = readData(
        tpcdLoc.msg,
        tpcdLoc.segId,
        tpcdLoc.wordOffset + tpcdLoc.dataWords + S.TPCD_PTR_ID,
      );
      return {
        kind: 'thirdPartyHosted',
        vineId: readUint32(tpcdLoc, S.TPCD_VINE_ID_BO),
        thirdPartyCapId: id ? new Uint8Array(id) : new Uint8Array(0),
      };
    }
    default:
      return { kind: 'unknown', tag };
  }
};

/* ===================================================================== *
 *  Payload
 * ===================================================================== */

/**
 * @param {any} msg
 * @param {{ segId: number, wordOffset: number }} slot
 * @param {{ contentBytes?: Uint8Array, capTable?: Array<any> }} payload
 */
const writePayload = (msg, slot, payload) => {
  const p = allocStruct(msg, slot, S.PAYLOAD_DATA_WORDS, S.PAYLOAD_PTR_WORDS);
  // Content: an opaque user-supplied bytes blob, written as Data list.
  // (Application-level types are not statically known to this layer.)
  const contentBytes = payload.contentBytes;
  if (contentBytes && contentBytes.length > 0) {
    writeData(msg, ptrSlot(p, S.PAYLOAD_PTR_CONTENT), contentBytes);
  }
  const capTable = payload.capTable;
  if (capTable && capTable.length > 0) {
    const list = allocCompositeList(
      msg,
      ptrSlot(p, S.PAYLOAD_PTR_CAP_TABLE),
      capTable.length,
      S.CAPDESC_DATA_WORDS,
      S.CAPDESC_PTR_WORDS,
    );
    for (let i = 0; i < capTable.length; i += 1) {
      const elem = compositeElement(msg, list, i);
      writeCapDescriptor(msg, elem, i, capTable[i]);
    }
  }
};

/** @param {any} loc */
const readPayload = loc => {
  if (loc === null) return { contentBytes: new Uint8Array(0), capTable: [] };
  const contentBytes =
    readData(
      loc.msg,
      loc.segId,
      loc.wordOffset + loc.dataWords + S.PAYLOAD_PTR_CONTENT,
    ) || new Uint8Array(0);
  const capListLoc = readListPointer(
    loc.msg,
    loc.segId,
    loc.wordOffset + loc.dataWords + S.PAYLOAD_PTR_CAP_TABLE,
  );
  const capTable = [];
  if (capListLoc !== null) {
    for (let i = 0; i < capListLoc.elemCount; i += 1) {
      capTable.push(
        readCapDescriptor(compositeElement(capListLoc.msg, capListLoc, i)),
      );
    }
  }
  return { contentBytes: new Uint8Array(contentBytes), capTable };
};

/* ===================================================================== *
 *  Top-level encoders
 * ===================================================================== */

export const encodeBootstrap = ({ questionId, deprecatedObjectId }) => {
  const { msg, root } = newMessageRoot();
  writeMessageTag(root, S.MSG_BOOTSTRAP);
  const v = allocVariant(
    msg,
    root,
    S.BOOTSTRAP_DATA_WORDS,
    S.BOOTSTRAP_PTR_WORDS,
  );
  writeUint32(v, S.BOOTSTRAP_QUESTION_ID, questionId);
  if (deprecatedObjectId) {
    writeData(msg, ptrSlot(v, 0), deprecatedObjectId);
  }
  return finalize(msg);
};

/**
 * @param {object} arg
 * @param {number} arg.questionId
 * @param {any} arg.target
 * @param {bigint} arg.interfaceId
 * @param {number} arg.methodId
 * @param {{ contentBytes?: Uint8Array, capTable?: any[] }} arg.params
 * @param {{ kind: 'caller' } |
 *         { kind: 'yourself' } |
 *         { kind: 'thirdParty', recipientId: Uint8Array }} [arg.sendResultsTo]
 * @param {boolean} [arg.allowThirdPartyTailCall]
 */
export const encodeCall = ({
  questionId,
  target,
  interfaceId,
  methodId,
  params,
  sendResultsTo = { kind: 'caller' },
  allowThirdPartyTailCall = false,
}) => {
  const { msg, root } = newMessageRoot();
  writeMessageTag(root, S.MSG_CALL);
  const v = allocVariant(msg, root, S.CALL_DATA_WORDS, S.CALL_PTR_WORDS);
  writeUint32(v, S.CALL_QUESTION_ID_BO, questionId);
  writeUint64(v, S.CALL_INTERFACE_ID_BO, interfaceId);
  writeUint16(v, S.CALL_METHOD_ID_BO, methodId);
  writeBool(v, S.CALL_ALLOW_3PTY_TAIL_BIT, allowThirdPartyTailCall);
  let srtTag = S.CALL_SRT_CALLER;
  if (sendResultsTo.kind === 'yourself') srtTag = S.CALL_SRT_YOURSELF;
  if (sendResultsTo.kind === 'thirdParty') srtTag = S.CALL_SRT_THIRD_PARTY;
  writeUint16(v, S.CALL_SEND_RESULTS_TO_TAG_BO, srtTag);
  writeMessageTarget(msg, ptrSlot(v, S.CALL_PTR_TARGET), target);
  writePayload(msg, ptrSlot(v, S.CALL_PTR_PARAMS), params);
  if (sendResultsTo.kind === 'thirdParty') {
    const tp = /** @type {{ recipientId: Uint8Array }} */ (sendResultsTo);
    writeData(msg, ptrSlot(v, S.CALL_PTR_SEND_RESULTS_TO_DATA), tp.recipientId);
  }
  return finalize(msg);
};

export const encodeReturn = ({ answerId, releaseParamCaps = true, result }) => {
  const { msg, root } = newMessageRoot();
  writeMessageTag(root, S.MSG_RETURN);
  const v = allocVariant(msg, root, S.RETURN_DATA_WORDS, S.RETURN_PTR_WORDS);
  writeUint32(v, S.RETURN_ANSWER_ID_BO, answerId);
  writeBoolDefaultTrue(v, S.RETURN_RELEASE_PARAM_CAPS_BIT, releaseParamCaps);
  if (result.kind === 'results') {
    writeUint16(v, S.RETURN_TAG_BO, S.RETURN_TAG_RESULTS);
    writePayload(msg, ptrSlot(v, S.RETURN_PTR_RESULTS), result.payload);
  } else if (result.kind === 'exception') {
    writeUint16(v, S.RETURN_TAG_BO, S.RETURN_TAG_EXCEPTION);
    writeException(msg, ptrSlot(v, S.RETURN_PTR_EXCEPTION), result.exception);
  } else if (result.kind === 'canceled') {
    writeUint16(v, S.RETURN_TAG_BO, S.RETURN_TAG_CANCELED);
  } else if (result.kind === 'resultsSentElsewhere') {
    writeUint16(v, S.RETURN_TAG_BO, S.RETURN_TAG_RESULTS_SENT_ELSEWHERE);
  } else if (result.kind === 'takeFromOtherQuestion') {
    writeUint16(v, S.RETURN_TAG_BO, S.RETURN_TAG_TAKE_FROM_OTHER_QUESTION);
    writeUint32(v, S.RETURN_TAKE_FROM_OTHER_QUESTION_ID_BO, result.questionId);
  } else if (result.kind === 'acceptFromThirdParty') {
    writeUint16(v, S.RETURN_TAG_BO, S.RETURN_TAG_ACCEPT_FROM_THIRD_PARTY);
    writeData(
      msg,
      ptrSlot(v, S.RETURN_PTR_ACCEPT_FROM_THIRD_PARTY),
      result.thirdPartyCapId,
    );
  } else {
    throw Fail`unknown return result kind ${result}`;
  }
  return finalize(msg);
};

export const encodeFinish = ({
  questionId,
  releaseResultCaps = true,
  requireEarlyCancellation = true,
}) => {
  const { msg, root } = newMessageRoot();
  writeMessageTag(root, S.MSG_FINISH);
  const v = allocVariant(msg, root, S.FINISH_DATA_WORDS, S.FINISH_PTR_WORDS);
  writeUint32(v, S.FINISH_QUESTION_ID_BO, questionId);
  writeBoolDefaultTrue(v, S.FINISH_RELEASE_RESULT_CAPS_BIT, releaseResultCaps);
  writeBoolDefaultTrue(
    v,
    S.FINISH_REQUIRE_EARLY_CANCELLATION_BIT,
    requireEarlyCancellation,
  );
  return finalize(msg);
};

export const encodeResolve = ({ promiseId, payload }) => {
  const { msg, root } = newMessageRoot();
  writeMessageTag(root, S.MSG_RESOLVE);
  const v = allocVariant(msg, root, S.RESOLVE_DATA_WORDS, S.RESOLVE_PTR_WORDS);
  writeUint32(v, S.RESOLVE_PROMISE_ID_BO, promiseId);
  if (payload.kind === 'cap') {
    writeUint16(v, S.RESOLVE_TAG_BO, S.RESOLVE_TAG_CAP);
    // CapDescriptor as a single element struct, but per rpc.capnp the
    // resolve.cap is a single CapDescriptor not a list, so we inline it.
    const capLoc = allocStruct(
      msg,
      ptrSlot(v, S.RESOLVE_PTR_CAP),
      S.CAPDESC_DATA_WORDS,
      S.CAPDESC_PTR_WORDS,
    );
    writeCapDescriptor(msg, capLoc, 0, payload.cap);
  } else if (payload.kind === 'exception') {
    writeUint16(v, S.RESOLVE_TAG_BO, S.RESOLVE_TAG_EXCEPTION);
    writeException(msg, ptrSlot(v, S.RESOLVE_PTR_EXCEPTION), payload.exception);
  } else {
    throw Fail`unknown resolve payload kind ${payload}`;
  }
  return finalize(msg);
};

export const encodeRelease = ({ id, referenceCount }) => {
  const { msg, root } = newMessageRoot();
  writeMessageTag(root, S.MSG_RELEASE);
  const v = allocVariant(msg, root, S.RELEASE_DATA_WORDS, S.RELEASE_PTR_WORDS);
  writeUint32(v, S.RELEASE_ID_BO, id);
  writeUint32(v, S.RELEASE_REF_COUNT_BO, referenceCount);
  return finalize(msg);
};

export const encodeDisembargo = ({ target, context }) => {
  const { msg, root } = newMessageRoot();
  writeMessageTag(root, S.MSG_DISEMBARGO);
  const v = allocVariant(
    msg,
    root,
    S.DISEMBARGO_DATA_WORDS,
    S.DISEMBARGO_PTR_WORDS,
  );
  writeMessageTarget(msg, ptrSlot(v, S.DISEMBARGO_PTR_TARGET), target);
  let tag = S.DISEMBARGO_CTX_SENDER_LOOPBACK;
  let value = 0;
  if (context.kind === 'senderLoopback') {
    tag = S.DISEMBARGO_CTX_SENDER_LOOPBACK;
    value = context.id;
  } else if (context.kind === 'receiverLoopback') {
    tag = S.DISEMBARGO_CTX_RECEIVER_LOOPBACK;
    value = context.id;
  } else if (context.kind === 'accept') {
    tag = S.DISEMBARGO_CTX_ACCEPT;
    value = 0;
  } else if (context.kind === 'provide') {
    tag = S.DISEMBARGO_CTX_PROVIDE;
    value = context.questionId;
  } else {
    throw Fail`unknown disembargo context ${context}`;
  }
  writeUint16(v, S.DISEMBARGO_CTX_TAG_BO, tag);
  writeUint32(v, S.DISEMBARGO_CTX_VALUE_BO, value);
  return finalize(msg);
};

export const encodeProvide = ({ questionId, target, recipient }) => {
  const { msg, root } = newMessageRoot();
  writeMessageTag(root, S.MSG_PROVIDE);
  const v = allocVariant(msg, root, S.PROVIDE_DATA_WORDS, S.PROVIDE_PTR_WORDS);
  writeUint32(v, S.PROVIDE_QUESTION_ID_BO, questionId);
  writeMessageTarget(msg, ptrSlot(v, S.PROVIDE_PTR_TARGET), target);
  writeData(msg, ptrSlot(v, S.PROVIDE_PTR_RECIPIENT), recipient);
  return finalize(msg);
};

export const encodeAccept = ({ questionId, provision, embargo = false }) => {
  const { msg, root } = newMessageRoot();
  writeMessageTag(root, S.MSG_ACCEPT);
  const v = allocVariant(msg, root, S.ACCEPT_DATA_WORDS, S.ACCEPT_PTR_WORDS);
  writeUint32(v, S.ACCEPT_QUESTION_ID_BO, questionId);
  writeBool(v, S.ACCEPT_EMBARGO_BIT, embargo);
  writeData(msg, ptrSlot(v, S.ACCEPT_PTR_PROVISION), provision);
  return finalize(msg);
};

/**
 * `Message.unimplemented \@0 :Message` — the variant *is* a Message struct
 * (recursively). We don't have parsed-bytes-to-Message conversion here;
 * the caller may pass the original framed bytes, but we encode an empty
 * inner Message-shaped placeholder. An empty Message decodes as the zero
 * discriminator (unimplemented) which means "no further info"; this is
 * wire-conformant for peers that only inspect the tag.
 *
 * @param {{ originalBytes?: Uint8Array }} _arg The originalBytes are
 *   intentionally ignored on the wire; the parameter is accepted so the
 *   API mirrors the other variant encoders.
 */
export const encodeUnimplemented = _arg => {
  const { msg, root } = newMessageRoot();
  writeMessageTag(root, S.MSG_UNIMPLEMENTED);
  allocStruct(msg, ptrSlot(root, 0), S.MESSAGE_DATA_WORDS, S.MESSAGE_PTR_WORDS);
  return finalize(msg);
};

export const encodeAbort = ({ exception }) => {
  // Message.abort @1 :Exception — the variant *is* an Exception struct, so
  // we allocate it directly into the Message's ptr[0].
  const { msg, root } = newMessageRoot();
  writeMessageTag(root, S.MSG_ABORT);
  writeException(msg, ptrSlot(root, 0), exception);
  return finalize(msg);
};

/* ===================================================================== *
 *  Decoder
 * ===================================================================== */

export const decodeMessage = framed => {
  const segments = unframeSegments(framed);
  const reader = makeMessageReader(segments);
  // Root pointer at segment 0, word 0.
  const rootLoc = readStructPointer(reader, 0, 0);
  if (rootLoc === null) throw Fail`null root pointer`;
  const tag = readUint16(rootLoc, S.MESSAGE_TAG_BYTE_OFFSET);
  const variantLoc = readStructPointer(
    reader,
    rootLoc.segId,
    rootLoc.wordOffset + rootLoc.dataWords + 0,
  );
  if (variantLoc === null && tag !== S.MSG_UNIMPLEMENTED) {
    throw Fail`null variant pointer for tag ${tag}`;
  }
  // TypeScript narrowing across switch arms below: every non-Unimplemented
  // arm has just been guarded above, so we assert non-null once.
  const variant = /** @type {NonNullable<typeof variantLoc>} */ (variantLoc);
  switch (tag) {
    case S.MSG_BOOTSTRAP: {
      const v = variant;
      const deprecatedObjectId = readData(
        v.msg,
        v.segId,
        v.wordOffset + v.dataWords + 0,
      );
      return {
        type: 'bootstrap',
        questionId: readUint32(v, S.BOOTSTRAP_QUESTION_ID),
        deprecatedObjectId: deprecatedObjectId
          ? new Uint8Array(deprecatedObjectId)
          : null,
      };
    }
    case S.MSG_CALL: {
      const v = variant;
      const srtTag = readUint16(v, S.CALL_SEND_RESULTS_TO_TAG_BO);
      let sendResultsTo;
      if (srtTag === S.CALL_SRT_CALLER) {
        sendResultsTo = { kind: 'caller' };
      } else if (srtTag === S.CALL_SRT_YOURSELF) {
        sendResultsTo = { kind: 'yourself' };
      } else {
        const recipientId = readData(
          v.msg,
          v.segId,
          v.wordOffset + v.dataWords + S.CALL_PTR_SEND_RESULTS_TO_DATA,
        );
        sendResultsTo = {
          kind: 'thirdParty',
          recipientId: recipientId
            ? new Uint8Array(recipientId)
            : new Uint8Array(0),
        };
      }
      const targetLoc = readStructPointer(
        v.msg,
        v.segId,
        v.wordOffset + v.dataWords + S.CALL_PTR_TARGET,
      );
      const paramsLoc = readStructPointer(
        v.msg,
        v.segId,
        v.wordOffset + v.dataWords + S.CALL_PTR_PARAMS,
      );
      return {
        type: 'call',
        questionId: readUint32(v, S.CALL_QUESTION_ID_BO),
        interfaceId: readUint64(v, S.CALL_INTERFACE_ID_BO),
        methodId: readUint16(v, S.CALL_METHOD_ID_BO),
        allowThirdPartyTailCall: readBool(v, S.CALL_ALLOW_3PTY_TAIL_BIT),
        target: readMessageTarget(targetLoc),
        params: readPayload(paramsLoc),
        sendResultsTo,
      };
    }
    case S.MSG_RETURN: {
      const v = variant;
      const retTag = readUint16(v, S.RETURN_TAG_BO);
      let result;
      if (retTag === S.RETURN_TAG_RESULTS) {
        const pLoc = readStructPointer(
          v.msg,
          v.segId,
          v.wordOffset + v.dataWords + S.RETURN_PTR_RESULTS,
        );
        result = { kind: 'results', payload: readPayload(pLoc) };
      } else if (retTag === S.RETURN_TAG_EXCEPTION) {
        const eLoc = readStructPointer(
          v.msg,
          v.segId,
          v.wordOffset + v.dataWords + S.RETURN_PTR_EXCEPTION,
        );
        result = { kind: 'exception', exception: readException(eLoc) };
      } else if (retTag === S.RETURN_TAG_CANCELED) {
        result = { kind: 'canceled' };
      } else if (retTag === S.RETURN_TAG_RESULTS_SENT_ELSEWHERE) {
        result = { kind: 'resultsSentElsewhere' };
      } else if (retTag === S.RETURN_TAG_TAKE_FROM_OTHER_QUESTION) {
        result = {
          kind: 'takeFromOtherQuestion',
          questionId: readUint32(v, S.RETURN_TAKE_FROM_OTHER_QUESTION_ID_BO),
        };
      } else if (retTag === S.RETURN_TAG_ACCEPT_FROM_THIRD_PARTY) {
        const tpid = readData(
          v.msg,
          v.segId,
          v.wordOffset + v.dataWords + S.RETURN_PTR_ACCEPT_FROM_THIRD_PARTY,
        );
        result = {
          kind: 'acceptFromThirdParty',
          thirdPartyCapId: tpid ? new Uint8Array(tpid) : new Uint8Array(0),
        };
      } else {
        result = { kind: 'unknown', tag: retTag };
      }
      return {
        type: 'return',
        answerId: readUint32(v, S.RETURN_ANSWER_ID_BO),
        releaseParamCaps: readBoolDefaultTrue(
          v,
          S.RETURN_RELEASE_PARAM_CAPS_BIT,
        ),
        result,
      };
    }
    case S.MSG_FINISH: {
      const v = variant;
      return {
        type: 'finish',
        questionId: readUint32(v, S.FINISH_QUESTION_ID_BO),
        releaseResultCaps: readBoolDefaultTrue(
          v,
          S.FINISH_RELEASE_RESULT_CAPS_BIT,
        ),
        requireEarlyCancellation: readBoolDefaultTrue(
          v,
          S.FINISH_REQUIRE_EARLY_CANCELLATION_BIT,
        ),
      };
    }
    case S.MSG_RESOLVE: {
      const v = variant;
      const resTag = readUint16(v, S.RESOLVE_TAG_BO);
      const promiseId = readUint32(v, S.RESOLVE_PROMISE_ID_BO);
      if (resTag === S.RESOLVE_TAG_CAP) {
        const capLoc = readStructPointer(
          v.msg,
          v.segId,
          v.wordOffset + v.dataWords + S.RESOLVE_PTR_CAP,
        );
        if (capLoc === null) throw Fail`resolve.cap with null pointer`;
        return {
          type: 'resolve',
          promiseId,
          payload: { kind: 'cap', cap: readCapDescriptor(capLoc) },
        };
      }
      const eLoc = readStructPointer(
        v.msg,
        v.segId,
        v.wordOffset + v.dataWords + S.RESOLVE_PTR_EXCEPTION,
      );
      return {
        type: 'resolve',
        promiseId,
        payload: { kind: 'exception', exception: readException(eLoc) },
      };
    }
    case S.MSG_RELEASE: {
      const v = variant;
      return {
        type: 'release',
        id: readUint32(v, S.RELEASE_ID_BO),
        referenceCount: readUint32(v, S.RELEASE_REF_COUNT_BO),
      };
    }
    case S.MSG_DISEMBARGO: {
      const v = variant;
      const ctxTag = readUint16(v, S.DISEMBARGO_CTX_TAG_BO);
      const ctxValue = readUint32(v, S.DISEMBARGO_CTX_VALUE_BO);
      const targetLoc = readStructPointer(
        v.msg,
        v.segId,
        v.wordOffset + v.dataWords + S.DISEMBARGO_PTR_TARGET,
      );
      let context;
      if (ctxTag === S.DISEMBARGO_CTX_SENDER_LOOPBACK) {
        context = { kind: 'senderLoopback', id: ctxValue };
      } else if (ctxTag === S.DISEMBARGO_CTX_RECEIVER_LOOPBACK) {
        context = { kind: 'receiverLoopback', id: ctxValue };
      } else if (ctxTag === S.DISEMBARGO_CTX_ACCEPT) {
        context = { kind: 'accept' };
      } else if (ctxTag === S.DISEMBARGO_CTX_PROVIDE) {
        context = { kind: 'provide', questionId: ctxValue };
      } else {
        context = { kind: 'unknown', tag: ctxTag };
      }
      return {
        type: 'disembargo',
        target: readMessageTarget(targetLoc),
        context,
      };
    }
    case S.MSG_PROVIDE: {
      const v = variant;
      const targetLoc = readStructPointer(
        v.msg,
        v.segId,
        v.wordOffset + v.dataWords + S.PROVIDE_PTR_TARGET,
      );
      const recipient = readData(
        v.msg,
        v.segId,
        v.wordOffset + v.dataWords + S.PROVIDE_PTR_RECIPIENT,
      );
      return {
        type: 'provide',
        questionId: readUint32(v, S.PROVIDE_QUESTION_ID_BO),
        target: readMessageTarget(targetLoc),
        recipient: recipient ? new Uint8Array(recipient) : new Uint8Array(0),
      };
    }
    case S.MSG_ACCEPT: {
      const v = variant;
      const provision = readData(
        v.msg,
        v.segId,
        v.wordOffset + v.dataWords + S.ACCEPT_PTR_PROVISION,
      );
      return {
        type: 'accept',
        questionId: readUint32(v, S.ACCEPT_QUESTION_ID_BO),
        embargo: readBool(v, S.ACCEPT_EMBARGO_BIT),
        provision: provision ? new Uint8Array(provision) : new Uint8Array(0),
      };
    }
    case S.MSG_UNIMPLEMENTED: {
      // Message.unimplemented is itself a Message struct; we don't recurse.
      return {
        type: 'unimplemented',
        originalBytes: new Uint8Array(0),
      };
    }
    case S.MSG_ABORT: {
      // Message.abort is an Exception struct directly.
      return { type: 'abort', exception: readException(variantLoc) };
    }
    case S.MSG_OBSOLETE_SAVE:
    case S.MSG_OBSOLETE_DELETE:
    case S.MSG_JOIN:
      return { type: 'unimplementedTag', tag };
    default:
      return { type: 'unimplementedTag', tag };
  }
};
