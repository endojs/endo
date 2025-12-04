# `@endo/errors`

When host and guest programs share a JavaScript context, there is some risk that
the guest will call a host function and induce it to throw an exception that
inadvertently reveals information about its internal state to the guest.
It is similarly possible that a guest would inadvertently reveal information to
a cotenant guest.

For this reason, the `@endo/errors` package provides utilities for constructing
errors with redacted messages.
In coordination with [ses](../src/ses/) in the host realm, the information
redacted by these utilities will be revealed to the realm's console for use
in debugging, but be invisible to code that catches them.
