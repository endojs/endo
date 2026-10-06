---
'@endo/captp': patch
---

CapTP no longer counts the `answerID`, `questionID`, and `target` of received messages as references. Those properties only name the message's question or target and transfer no reference; every real transfer is already counted when a payload is serialized and unserialized. The extra counts landed under the keys of unrelated local slots: every received question left a permanent bookkeeping entry, and a peer calling a local export inflated the count for the same-numbered local import, which could make the peer drop an export that still had a reference in flight.
