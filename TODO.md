sleepy vat ephemeral subscription problem:
  if vat goes to sleep, subs are lost, ui has no way to know
  solution?
  - [ ] make ui captp connection durable(-ish), not actually endured (?)
  - [ ] clear ui import table on disconnect/serialize/restart, triggering cleanup
  - [ ] make subs durable
    - [ ] makeDurableFn (?)
    - [x] defineDurableWeakRef (?)
  - [ ] make subscribeWeakly
  this should trigger cleanup of the handler,
  tho not sure what happens if the handler doesnt get cleanup

