
# Next release

- Introduced `nullQueue`, a queue into which one can sink (and forget) values
  and out of which undefined springs immediately and indefinitely.
  The null async queue is useful for relieving the back or forward pressure
  signal of a stream, as is necessary for pubsub.
