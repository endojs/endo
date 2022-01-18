# Endo Daemon

This package provides the Endo daemon and controller.
The controller manages the Endo daemon lifecycle.

The Endo daemon is a persistent host for managing guest programs in hardened
JavaScript worker processes.
The daemon communicates through a Unix domain socket or named pipe associated
with the user, and manages per-user storage and compute access.

Over that channel, the daemon communicates in CapTP over netstring message
envelopes.
The bootstrap object has public and private facets.
All access over the public facet are mediate on the private facet.
So, for example, a request for a handle would be posed on the public facet, and
the user would be obliged to answer on the private facet.
