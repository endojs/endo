# @endo/pubsub

## 0.1.0 (unreleased)

- Initial release.
- Lossless deltas topic via `makeChangeTopic` over the Sink + Spring async
  promise linked list convention.
- Lossy topic via `makeLatestTopic` with a single-cell most-recent-value
  retention policy.
- `makePubSub` exposes the underlying sink + spring primitive for callers who
  want to compose their own topic shapes.
- Each tool is published as its own subpath export (no barrel module); import
  the specific module a dependent needs.
- Cancellation is provided by [`@endo/cancel`](../cancel/README.md) rather than
  a bundled primitive.
