// @ts-check

import { M } from '@endo/patterns';

/**
 * The one-shot response capability carried on every delivered reminder
 * message. The recipient calls `resolve()` when it has handled the message
 * (the scheduler arms the next period) or `reschedule()` to retry the same
 * message after a jittered backoff. Both are one-shot: whichever fires first
 * consumes the delivery, and every later call - including a late call after
 * the message-timeout already auto-resolved - is inert.
 */
export const ReminderResponseInterface = M.interface('ReminderResponse', {
  resolve: M.call().returns(M.undefined()),
  reschedule: M.call().returns(M.undefined()),
});
