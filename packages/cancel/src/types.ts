/**
 * A cancellation token that never fulfills.
 */
export type Cancelled = Promise<never>;

/**
 * A function that triggers cancellation.
 */
export type Cancel = (reason?: Error) => void;

/**
 * A function that synchronously checks if cancellation has been requested.
 */
export type IsCancelled = () => boolean;

/**
 * The result of `makeCancelKit()`.
 */
export interface CancelKit {
  /** The cancellation token. */
  cancelled: Cancelled;
  /** Function to trigger cancellation. */
  cancel: Cancel;
  /** Function to synchronously check cancellation state. */
  isCancelled: IsCancelled;
}

/**
 * Callback for `allMap` and `anyMap` operations.
 */
export type CancellableCallback<T, R> = (
  /** The current value. */
  value: T,
  /** The current index. */
  index: number,
  /** Cancellation token for this operation. */
  cancelled: Cancelled,
  /** Synchronous cancellation check. */
  isCancelled: IsCancelled,
) => R | Promise<R>;
