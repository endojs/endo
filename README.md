# Evaluate

INSECURE three-argument evaluate function.  The evaluated code will have full
access to the globals, which is far more authority than you really want to give
that code.

You should be using [Secure ECMAScript](https://github.com/Agoric/SES) or Realms
to call `evaluate` with security in mind.

This repository contains a stub implementation of evaluate.  If you really
need it, you will know, and you are on your own.
