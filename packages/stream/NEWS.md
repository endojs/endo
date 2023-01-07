
# Next release

- Introduced `nullQueue`, a queue into which one can sink (and forget) values
  and out of which undefined springs immediately and indefinitely.
  The null async queue is useful for relieving the back or forward pressure
  signal of a stream, as is necessary for pubsub.
- Introduced `makeTopic` and the underlying `makePubSub`.
  `makeTopic` makes a kit with a publisher and a function for subscribing
  to all values subsequently published.
  So, topics have one producer and any number of consumers.
  Publishers and subscribers are streams.
  However, the publisher receives no back-pressure.
  Subscribers have very low overhead and unsubscribing is implicit in releasing
  the subscriber to garbage collection.
