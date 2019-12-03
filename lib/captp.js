// This logic was mostly lifted from @agoric/swingset-vat liveSlots.js
// Defects in it are mfig's fault.
import { makeMarshal, QCLASS } from '@agoric/marshal';
import harden from '@agoric/harden';
import Nat from '@agoric/nat';
import { HandledPromise, E } from '@agoric/eventual-send';

export { E, HandledPromise, Nat, harden };

export function makeCapTP(ourId, send, bootstrapObj = undefined) {
  let unplug = false;
  const { serialize, unserialize } = makeMarshal(
    // eslint-disable-next-line no-use-before-define
    serializeSlot,
    // eslint-disable-next-line no-use-before-define
    unserializeSlot,
  );

  let lastPromiseID = 0;
  let lastExportID = 0;
  let lastQuestionID = 0;

  const valToSlot = new WeakMap();
  const slotToVal = new Map(); // exports
  const questions = new Map(); // chosen by us
  const answers = new Map(); // chosen by our peer
  const imports = new Map(); // chosen by our peer

  function serializeSlot(val, slots, slotMap) {
    if (!slotMap.has(val)) {
      let slot;
      if (!valToSlot.has(val)) {
        // new export
        if (Promise.resolve(val) === val) {
          lastPromiseID += 1;
          const promiseID = lastPromiseID;
          slot = `p+${promiseID}`;
          val.then(
            res =>
              send({
                type: 'CTP_RESOLVE',
                promiseID,
                res: serialize(harden(res)),
              }),
            rej =>
              send({
                type: 'CTP_RESOLVE',
                promiseID,
                rej: serialize(harden(rej)),
              }),
          );
        } else {
          lastExportID += 1;
          const exportID = lastExportID;
          slot = `o+${exportID}`;
        }
        valToSlot.set(val, slot);
        slotToVal.set(slot, val);
      }

      slot = valToSlot.get(val);
      const slotIndex = slots.length;
      slots.push(slot);
      slotMap.set(val, slotIndex);
    }

    const slotIndex = slotMap.get(val);
    return harden({
      [QCLASS]: 'slot',
      index: slotIndex,
    });
  }

  function makeQuestion() {
    lastQuestionID += 1;
    const questionID = lastQuestionID;
    // eslint-disable-next-line no-use-before-define
    const pr = makeRemote(questionID);
    questions.set(questionID, pr);
    return [questionID, pr];
  }

  function makeRemote(target) {
    const handler = {
      GET(_o, prop) {
        const [questionID, pr] = makeQuestion();
        send({
          type: 'CTP_CALL',
          questionID,
          target,
          method: serialize(harden([prop])),
        });
        return harden(pr.p);
      },
      POST(_o, prop, args) {
        // Support: o~.[prop](...args) remote method invocation
        const [questionID, pr] = makeQuestion();
        send({
          type: 'CTP_CALL',
          questionID,
          target,
          method: serialize(harden([prop, args])),
        });
        return harden(pr.p);
      },
    };

    const pr = {};
    pr.p = Promise.makeHandled((res, rej, resolveWithPresence) => {
      pr.rej = rej;
      pr.resPres = () => resolveWithPresence(handler);
      pr.res = res;
    }, handler);
    return harden(pr);
  }

  function unserializeSlot(data, slots) {
    const theirSlot = slots[Nat(data.index)];
    let val;
    const otherDir = theirSlot[1] === '+' ? '-' : '+';
    const slot = `${theirSlot[0]}${otherDir}${theirSlot.slice(2)}`;
    if (!slotToVal.has(slot)) {
      // Make a new handled promise for the slot.
      const pr = makeRemote(slot);
      if (slot[0] === 'o') {
        // A new presence
        const presence = pr.resPres();
        presence.toString = () => `[Presence ${ourId} ${slot}]`;
        harden(presence);
        val = presence;
      } else {
        // A new promise
        imports.set(Number(slot.slice(2)), pr);
        val = pr.p;
      }
      slotToVal.set(slot, val);
      valToSlot.set(val, slot);
    }
    return slotToVal.get(slot);
  }

  const handler = {
    CTP_BOOTSTRAP(obj) {
      const { questionID } = obj;
      const bootstrap =
        typeof bootstrapObj === 'function' ? bootstrapObj() : bootstrapObj;
      // console.log('sending bootstrap', bootstrap);
      answers.set(questionID, bootstrap);
      send({
        type: 'CTP_RETURN',
        answerID: questionID,
        result: serialize(bootstrap),
      });
    },
    CTP_CALL(obj) {
      const { questionID, target } = obj;
      const [prop, args] = unserialize(obj.method);
      let val;
      if (answers.has(target)) {
        val = answers.get(target);
      } else {
        val = unserialize({
          body: JSON.stringify({
            [QCLASS]: 'slot',
            index: 0,
          }),
          slots: [target],
        });
      }
      const hp = args
        ? HandledPromise.applyMethod(val, prop, args)
        : HandledPromise.get(val, prop);
      answers.set(questionID, hp);
      hp.then(res =>
        send({
          type: 'CTP_RETURN',
          answerID: questionID,
          result: serialize(harden(res)),
        }),
      ).catch(rej =>
        send({
          type: 'CTP_RETURN',
          answerID: questionID,
          exception: serialize(harden(rej)),
        }),
      );
    },
    CTP_RETURN(obj) {
      const { result, exception, answerID } = obj;
      const pr = questions.get(answerID);
      if ('exception' in obj) {
        pr.rej(unserialize(exception));
      } else {
        pr.res(unserialize(result));
      }
      questions.delete(answerID);
    },
    CTP_RESOLVE(obj) {
      const { promiseID, res, rej } = obj;
      const pr = imports.get(promiseID);
      if ('rej' in obj) {
        pr.rej(unserialize(rej));
      } else {
        pr.res(unserialize(res));
      }
      imports.delete(promiseID);
    },
    CTP_ABORT(obj) {
      const { exception } = obj;
      unplug = true;
      for (const pr of questions.values()) {
        pr.rej(exception);
      }
      for (const pr of imports.values()) {
        pr.rej(exception);
      }
      send(obj);
    },
  };

  // Get a reference to the other side's bootstrap object.
  const getBootstrap = () => {
    const [questionID, pr] = makeQuestion();
    send({
      type: 'CTP_BOOTSTRAP',
      questionID,
    });
    return harden(pr.p);
  };
  harden(handler);

  // Return a dispatch function.
  const dispatch = obj => {
    if (unplug) {
      return false;
    }
    const fn = handler[obj.type];
    if (fn) {
      fn(obj);
      return true;
    }
    return false;
  };

  // Abort a connection.
  const abort = exception => dispatch({ type: 'CTP_ABORT', exception });

  return harden({ abort, dispatch, getBootstrap });
}
