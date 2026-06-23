# @endo/pubsub

## 0.1.0 (unreleased)

- Initial release.
- Lossless deltas topic via `makeChangeTopic` over the Sink + Spring async
  promise linked list convention.
- Lossy topic via `makeLatestTopic` with a single-cell most-recent-value
  retention policy.
- `makePubSub` exposes the underlying sink + spring primitive for callers who
  want to compose their own topic shapes.
- `makeCancelKit` provides a small `{ cancel, cancelled }` cancellation
  primitive.
