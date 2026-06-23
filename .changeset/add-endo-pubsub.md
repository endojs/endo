---
'@endo/pubsub': minor
---

Add `@endo/pubsub` package: local-layer pubsub topics over a shared async promise linked list (the Sink + Spring convention).
Ships `makeChangeTopic` (lossless deltas: every subscriber sees every value published after iteration begins), `makeLatestTopic` (lossy: subscribers see only the most-recent value), the underlying `makePubSub` sink+spring primitive, and a `makeCancelKit` cancellation primitive.
Incubates on the `llm` roadmap branch ahead of projection to `master` (precipitated by PR #507 design review).
