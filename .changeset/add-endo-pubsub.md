---
'@endo/pubsub': minor
---

Add `@endo/pubsub` package: local-layer pubsub topics over a shared async promise linked list (the Sink + Spring convention).
Ships `makeChangeTopic` (lossless deltas: every subscriber sees every value published after iteration begins), `makeLatestTopic` (lossy: subscribers see only the most-recent value), and the underlying `makePubSub` sink+spring primitive, each as its own subpath export (no barrel module).
Cancellation is provided by `@endo/cancel` rather than a bundled primitive.
Incubates on the `llm` roadmap branch ahead of projection to `master` (precipitated by PR #507 design review).
