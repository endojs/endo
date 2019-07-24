# Evaluate

INSECURE three-argument evaluate function.  The evaluated code will have full
access to the globals, which is usually far more authority than you really want
to give that code.

You should be using [Secure ECMAScript](https://github.com/Agoric/SES) or Realms
to call `evaluate` with security in mind.

This repository contains an INSECURE implementation of evaluate.  If you really
need it, you will know, and you are on your own.
