# Endo Daemon

This package provides the Endo daemon and controller.
The controller manages the Endo daemon lifecycle.

The Endo daemon is a persistent host for managing guest programs in hardened
JavaScript worker processes.
The daemon communicates through a Unix domain socket or named pipe associated
with the user, and manages per-user storage and compute access.

Over that channel, the daemon communicates in CapTP over netstring message
envelopes.
The bootstrap provides the user agent API from which one can derive facets for
other agents.
