/// <refs types="ses"/>

// This module provides a control-loop for governing the concurrency of reads
// as a mitigation for exhausting file descriptors, retrying over interrupts,
// and maximizing throughput regardless of the underlying transport.
//
// It does not escape the notice of the author that in practice concurrent
// reads from a file system do not tend to increase throughput.

// At time of writing, the compartment mapper can be used with or without
// lockdown, so these superficial duplicates of makeQueue and makePromiseKit
// are necessary only because harden is not available without lockdown.
// We may revisit this design if it becomes possible to use the generalized
// versions of these utilities before application of lockdown as discussed:
// https://github.com/endojs/endo/issues/1686

const { Fail, quote: q } = assert;

const makePromiseKit = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

export const makeQueue = () => {
  let { promise: tailPromise, resolve: tailResolve } = makePromiseKit();
  return {
    put(value) {
      const { resolve, promise } = makePromiseKit();
      tailResolve({ value, promise });
      tailResolve = resolve;
    },
    get() {
      const promise = tailPromise.then(next => next.value);
      tailPromise = tailPromise.then(next => next.promise);
      return promise;
    },
  };
};

/**
 * @param {object} args
 * @param {number} [args.initialConcurrency]
 * @param {number} [args.minimumConcurrency]
 * @param {number} [args.maximumConcurrency]
 * @param {() => number} args.now - a clock of arbitrary precision and
 * magnitude.
 * @param {(error: {message: string}) => boolean} args.isExhaustedError
 * @param {(error: {message: string}) => boolean} args.isInterruptedError
 */
export const makeGovernor = ({
  minimumConcurrency = 1,
  initialConcurrency = minimumConcurrency,
  maximumConcurrency = Infinity,
  now,
  isExhaustedError,
  isInterruptedError,
}) => {
  minimumConcurrency >= 1 || Fail`Minimum concurrency limit must be at least 1`;
  initialConcurrency >= minimumConcurrency ||
    Fail`Initial concurrency limit must be at least ${q(minimumConcurrency)}`;
  initialConcurrency <= maximumConcurrency ||
    Fail`Initial concurrency limit must be at most ${q(maximumConcurrency)}`;
  const queue = makeQueue();
  let limit = initialConcurrency;
  let concurrency = initialConcurrency;
  for (let i = 0; i < initialConcurrency; i += 1) {
    queue.put();
  }

  let prev = 0;

  const wrapRead = read => {
    // We cannot govern throughput without a timer of some resolution.
    // Inside a SES compartment the fallback of Date.now produces NaN.
    if (Number.isNaN(now())) {
      return read;
    }

    /**
     * @param {string} location
     */
    const wrappedRead = async location => {
      await queue.get();
      const start = now();

      try {
        const result = await read(location);

        // Adjust concurrency limit in proportion to the change in
        // throughput.
        // A reduction in throughput indicates saturation over the bus from the
        // underlying storage and suggests that we should reduce concurrent
        // reads.
        // An increase in throughput suggests an opportunity to exploit further
        // concurrency.
        const end = now();
        // Make no adjustment if the resolution of the timer is not sufficient
        // to measure any duration between the beginning and end of the read.
        if (prev > 0 && end !== start) {
          const next = result.byteLength / (end - start);
          const change = next / prev;
          if (change > 1) {
            // Until we have saturated the bus, we cannot expect throughput to
            // increase except due to noise.
            // So, to exaggerate that noise, we increment the concurrency
            // limit, which causes this algorithm to degenerate to the AIMD
            // behavior similar to TCP slow start.
            limit = Math.min(maximumConcurrency, limit + 1);
          } else if (change < 1) {
            // With decreasing throughput, at least allow one concurrent read, or
            // we will never recover.
            limit = Math.max(minimumConcurrency, limit * change);
          }
          // console.log('concurrency', concurrency, 'limit', limit);
          prev = next;
        }

        return result;
      } catch (error) {
        if (isInterruptedError(error)) {
          // Interruptions do not indicate resource exhaustion, but the
          // duration of a read that spans an interrupt does no indicate a
          // reduction of throughput.
          // We do not await the promise returned so our finally block runs
          // before the promise settles.
          return wrappedRead(location);
        }
        if (isExhaustedError(error)) {
          // Multiplicative back-off if concurrency has caused the depletion of
          // a resource, specifically file descriptors.
          limit = Math.max(minimumConcurrency, limit / 2);
          // We do not await the promise returned so our finally block runs
          // before the promise settles.
          return wrappedRead(location);
        } else {
          throw error;
        }
      } finally {
        // Unblock further concurrent reads.
        concurrency -= 1;
        for (let i = 0; i <= limit - concurrency; i += 1) {
          concurrency += 1;
          queue.put();
          // console.log('concurrency', concurrency);
        }
      }
    };
    return wrappedRead;
  };

  return { wrapRead };
};
