/**
 * Type definitions for `@endo/reminder`. Per Endo house style the package's
 * shared types live in a dedicated declaration module, pulled into the `.js`
 * sources with a top-of-file `@import { ... } from './types.js'`.
 */

/** The named, persisted reschedule-backoff parameters for a reminder. */
export type ReminderBackoff = {
  /** The first retry's base delay. */
  initialMs: number;
  /** The ceiling the exponential growth is clamped to. */
  maxMs: number;
  /** The exponential base (2 reproduces the superseded design). */
  multiplier: number;
  /**
   * Full-jitter band width as a fraction of the computed delay; a retry samples
   * uniformly within `[raw * (1 - jitterFraction), raw]`.
   */
  jitterFraction: number;
};

/**
 * One persisted reminder document (`reminders/<id>.json`). `nextTickAt` is an
 * absolute epoch-ms time (the name is carried from the superseded design's
 * persistence layout).
 */
export type ReminderEntry = {
  id: string;
  label: string;
  periodMs: number;
  firstDelayMs: number;
  /** Per-message response deadline. */
  messageTimeoutMs: number;
  /** Absolute epoch ms of the next scheduled message. */
  nextTickAt: number;
  createdAt: number;
  /** Count of messages delivered so far. */
  messageCount: number;
  status: 'active' | 'cancelled';
  /** How missed messages are treated on recovery. */
  catchUpPolicy: 'coalesce' | 'skip';
  /** What a coalesced message conveys. */
  annotation: 'count' | 'timestamps';
  backoff: ReminderBackoff;
  /** Persisted backoff streak. */
  consecutiveFailures: number;
};

/** The one-shot response capability carried on each delivered message. */
export type ReminderResponse = {
  resolve: () => void;
  reschedule: () => void;
};

/** The annotation payload a delivered message carries. */
export type ReminderAnnotation =
  | { kind: 'count'; count: number }
  | { kind: 'timestamps'; scheduledTimes: number[] };

/** A delivered reminder message. */
export type ReminderMessage = {
  type: 'reminder-message';
  reminderId: string;
  label: string;
  periodMs: number;
  messageNumber: number;
  /** Absolute epoch ms this message was scheduled for. */
  scheduledAt: number;
  /** Absolute epoch ms it actually fired. */
  actualAt: number;
  /** Count of messages coalesced into this one. */
  missedMessages: number;
  annotation: ReminderAnnotation;
  reminderResponse: ReminderResponse;
};

/**
 * A writable virtual-file-system Directory cap (`@endo/platform/fs/extended`),
 * or an eventual reference to one. Only the reconciled writable-tree verbs are
 * used, so the concrete cap type is intentionally opaque here.
 */
export type ReminderStoreDirectory = any;

/** The durable store adapter over the VFS directory (`./store.js`). */
export type ReminderStore = {
  readConfig: () => Promise<any>;
  writeConfig: (config: unknown) => Promise<void>;
  readAllReminders: () => Promise<any[]>;
  writeReminder: (entry: { id: string }) => Promise<void>;
  removeReminder: (id: string) => Promise<void>;
};

/** Powers for `makeReminderService`. */
export type ReminderServicePowers = {
  store: ReminderStore;
  makeId: () => Promise<string>;
  onMessage?: (message: ReminderMessage) => unknown;
  onReminderCancel?: (reminderId: string) => void;
  maxActive?: number;
  minPeriodMs?: number;
  paused?: boolean;
  setTimeout?: (callback: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  now?: () => number;
  random?: () => number;
};

/**
 * The `ReminderService` exo returned to the integration; hands out the two
 * caretaker facets. Its concrete exo type is opaque here.
 */
export type ReminderServiceExo = any;

/** The internal return of `makeReminderService`. */
export type ReminderService = {
  service: ReminderServiceExo;
  /** The agent-facing `ReminderScheduler` facet. */
  scheduler: any;
  /** The integration-facing `ReminderControl` facet. */
  control: any;
  /** In-memory teardown for the cancellation hook. */
  stop: () => void;
};
