/**
 * A cancellation token that is a `Promise<never>`.
 */
export type Cancelled = Promise<never>;

/**
 * A function that triggers cancellation.
 *
 * @param reason - Optional reason for cancellation.
 */
export type Cancel = (reason?: Error) => void;

/**
 * A function that synchronously checks if cancellation has been requested.
 */
export type IsCancelled = () => boolean;

/**
 * The result of `makeCancelKit()`, containing the cancellation token, the
 * cancel function, and a synchronous observation function.
 */
export type CancelKit = {
  /** The cancellation token. */
  cancelled: Cancelled;
  /** Function to trigger cancellation. */
  cancel: Cancel;
  /** Function to synchronously check cancellation state. */
  isCancelled: IsCancelled;
};

/**
 * Callback for `allMap` and `anyMap` operations.
 *
 * @param value - The current value.
 * @param index - The current index.
 * @param cancelled - Cancellation token for this operation.
 * @param isCancelled - Synchronous cancellation check.
 */
export type CancellableCallback<T, R> = (
  value: T,
  index: number,
  cancelled: Cancelled,
  isCancelled: IsCancelled,
) => R | Promise<R>;
