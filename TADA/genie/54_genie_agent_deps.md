# Genie Main Agent

- improve `isInboxMessage`
  - [x] use `@endo/patterns` to match, not our own one-off logic
    - defined `InboxMessageShape` with `M.splitRecord`
    - `isInboxMessage` now delegates to `matches(m, InboxMessageShape)`
