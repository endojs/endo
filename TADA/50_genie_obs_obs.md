# Action Items

- [x] review the analysis below
- [x] create `TODO/` follow up tasks to implement its "Design Plan"
  - but break up observer and reflector work separately:
  - first task → `TODO/51_genie_observer_stream.md`:
    1. Expose the ChatEvent stream from observer
    2. Render sub-agent observer events in dev-repl
    3. Blocking `.observe` until done
  - second task → `TODO/52_genie_reflector_stream.md`:
    1. Expose the ChatEvent stream from reflector
    2. Render sub-agent reflector events in dev-repl
    3. Blocking `.reflect` until done
- [x] create a final follow up task to review the above work, and to then
  design and implement "Future: background streaming" describe at the end of
  this task → `TODO/53_genie_obs_bg_stream.md`

# Analysis

## Current State

Both observer and reflector create internal PiAgent instances and call
`runAgentRound()`, which returns `AsyncIterable<ChatEvent>`.
Today they **drain events silently**:

```js
// observer/index.js line 296
for await (const _event of runAgentRound(observerAgent, prompt)) {
  // Intentionally empty
}
```

```js
// reflector/index.js line 232
for await (const _event of runAgentRound(reflectorAgent, prompt)) {
  // Intentionally empty
}
```

The `.observe` command is fire-and-forget (triggers background work,
returns immediately).
The `.reflect` command already awaits completion but sees no events.

## Key Constraints

- Observer uses fire-and-forget via `triggerObservation()` — it wraps
  `runObservation()` in a detached promise chain.
- Both guard against concurrent runs via a `running` flag.
- `runAgentEvents()` in dev-repl.js already knows how to render any
  `AsyncIterable<ChatEvent>` into ANSI output strings.
- The dev-repl is an async generator itself; it `yield*`s output chunks.

# Design Plan

## 1. Expose the ChatEvent stream from observer and reflector

Instead of draining events internally, both `runObservation` and
`runReflection` should **yield** (or expose) the ChatEvent stream
to their callers.

### Option A: Return the stream (chosen)

Change the internal `runObservation()` and `runReflection()` functions
to return the `AsyncIterable<ChatEvent>` rather than draining it:

```js
// observer/index.js — runObservation becomes a factory that returns
// the event stream. The caller is responsible for draining it.
const runObservation = async (messages, fromIndex) => {
  // ... build excerpt, create observerAgent ...
  const events = runAgentRound(observerAgent, prompt);

  // Return an async iterable that drains the stream and performs
  // post-run cleanup (sync, advance hwm) after the last event.
  return {
    async *[Symbol.asyncIterator]() {
      yield* events;
      // Post-run: sync search index, advance hwm
      if (searchBackend && searchBackend.sync) {
        await searchBackend.sync();
      }
      hwm = messages.length;
    },
  };
};
```

Same pattern for `runReflection()` in reflector.

### New public API shape

Both observer and reflector gain a method that returns the event
stream (or `undefined` if there's nothing to do / already running):

```js
// Observer
/**
 * @param {any} mainAgent
 * @returns {AsyncIterable<ChatEvent> | undefined}
 */
const observe = (mainAgent) => { ... };

// Reflector
/**
 * @returns {Promise<AsyncIterable<ChatEvent> | undefined>}
 */
const reflect = async () => { ... };
```

The existing fire-and-forget `triggerObservation` / background
behavior stays as-is for the **automatic** triggers (threshold,
idle timer, heartbeat).
Only the `.observe` / `.reflect` dot-commands use the new
stream-returning methods.

## 2. Render sub-agent events in dev-repl

The dev-repl already has `runAgentEvents(events, options)` which
converts `AsyncIterable<ChatEvent>` into display strings.
We reuse it with a distinct prefix/label to distinguish sub-agent
output from the primary agent.

For the `.observe` and `.reflect` handlers:

```js
} else if (prompt === '.observe') {
  if (!observer) { ... }
  else if (observer.isRunning()) { ... }
  else {
    yield `${DIM}Running observation cycle...${RESET}\n`;
    const events = observer.observe(piAgent);
    if (events) {
      yield* prefixEvents(
        runAgentEvents(events, { verbose }),
        'observer',
      );
      yield `${GREEN}✓ Observation complete.${RESET}\n`;
    } else {
      yield `${DIM}No unobserved messages to process.${RESET}\n`;
    }
  }
}
```

`prefixEvents` is a thin wrapper that prepends a dim label like
`[observer]` or `[reflector]` to each yielded line, or
alternatively we pass a `label` option to `runAgentEvents`.

**Simplest approach**: add an optional `label` parameter to
`runAgentEvents` that replaces the `genie>` prefix with e.g.
`observer>` or `reflector>`.

## 3. Blocking `.observe` and `.reflect` until done

### `.reflect` — already blocking

`.reflect` already `await`s `reflector.run()`.
With the stream-returning API, we `yield*` the event stream which
naturally blocks until the stream is exhausted (all events
consumed), then continues to the completion message.

### `.observe` — currently fire-and-forget

Today `.observe` calls `observer.check()` / `observer.onIdle()`
which are fire-and-forget.
With the new `observer.observe(piAgent)` method:

1. It returns an `AsyncIterable<ChatEvent>` or `undefined`.
2. The dev-repl does `yield* runAgentEvents(events)` which blocks
   the REPL prompt until the stream is fully drained.
3. The `running` flag is managed inside the async iterable's
   finally block to ensure cleanup.

```js
const observe = (mainAgent) => {
  if (running) return undefined;
  const { messages } = mainAgent.state;
  if (hwm >= messages.length) return undefined;

  running = true;
  const stream = runObservation(messages, hwm);

  return {
    async *[Symbol.asyncIterator]() {
      try {
        yield* await stream;
      } finally {
        running = false;
        inflight = null;
      }
    },
  };
};
```

This way:
- **Manual** `.observe` blocks the REPL and streams events.
- **Automatic** triggers (threshold check, idle timer) continue to
  use the existing fire-and-forget `triggerObservation()` path,
  which drains events silently in the background.

## 4. Summary of changes

| File | Change |
|------|--------|
| `src/observer/index.js` | `runObservation` returns `AsyncIterable<ChatEvent>` instead of draining. New `observe(mainAgent)` method on the returned object. Background `triggerObservation` drains the stream silently (preserves current behavior). |
| `src/reflector/index.js` | `runReflection` returns `AsyncIterable<ChatEvent>` instead of draining. New `reflect()` method on the returned object. Background `run()` drains silently (preserves current behavior). |
| `dev-repl.js` `.observe` handler | Use `observer.observe(piAgent)` + `yield* runAgentEvents(events)` to stream and block. |
| `dev-repl.js` `.reflect` handler | Use `reflector.reflect()` + `yield* runAgentEvents(events)` to stream and block. |
| `dev-repl.js` `runAgentEvents` | Add optional `label` param to customize the agent name prefix (default `'genie'`). |
| `dev-repl.js` makeObserver/makeReflector calls | Remove the TODO comments (lines 677-678, 686-687). |

# Future: background streaming

For automatic (non-command) observer/reflector runs, we could optionally
interleave their events into the REPL output stream between user prompts.

This is out of scope for this task but the design supports it: the
stream-returning API means any caller can choose to render or discard events.
