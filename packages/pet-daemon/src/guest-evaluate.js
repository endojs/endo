let nextRequestId = 0;

const makeRequestId = () => {
 nextRequestId += 1;
 return `${Date.now()}-${nextRequestId}`;
};

export const makeGuestEvaluator = mailbox => {
 if (!mailbox || typeof mailbox.send !== 'function' || typeof mailbox.receive !== 'function') {
    throw new TypeError('mailbox must have send and receive functions');
 }

 const evaluate = async program => {
    if (typeof program !== 'string') {
      throw new TypeError('program must be a string');
    }

    const requestId = makeRequestId();
    const message = {
      type: 'evaluation-request',
      requestId,
      source: program,
      location: {
        source: 'guest',
        line: 1,
        column: 0,
      },
    };

    await mailbox.send(message);

    for (;;) {
      const response = await mailbox.receive();
      if (!response) {
        throw new Error('No response from host');
      }
      if (response.type === 'evaluation-response' && response.requestId === requestId) {
        if (response.allow === true || response.decision === 'allow' || response.ok === true) {
          return response;
        }
        const reason = response.reason || response.error || 'Evaluation denied';
        throw new Error(reason);
      }
    }
 };

 return evaluate;
};
