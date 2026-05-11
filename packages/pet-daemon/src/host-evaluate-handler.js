import { makePromiseKit } from '@endo/promise-kit';

export const makeHostEvaluateHandler = (mailbox, endo, presenter) => {
  const { promise, resolve } = makePromiseKit();

  const handler = async message => {
    if (message.type !== 'evaluation-request') {
      return;
    }

    const { code, requestID } = message;

    const decision = await presenter.presentEvaluationRequest(code);

    if (!decision.approved) {
      await mailbox.send({
        type: 'evaluation-response',
        requestID,
        approved: false,
        reason: decision.reason,
      });
      return;
    }

    let result;
    let error;
    try {
      result = await endo.evaluate(code);
    } catch (err) {
      error = String(err);
    }

    await mailbox.send({
      type: 'evaluation-response',
      requestID,
      approved: true,
      result,
      error,
    });
  };

  mailbox.addHandler(handler);

  return promise;
};
