# SES failed to initialized, Node.js domains have been initialized (SES_NO_DOMAINS)

The SES shim cannot guarantee the containment of tenant programs if a program
uses the deprecated [Node.js domains](https://nodejs.org/api/domain.html)
feature.

SES attempts to detect whether Node.js domains have been initialized, and also
attempts to prevent the domains module from initializing in the future, by
testing and breaking the `process.domain` property.

Domains introduce a `domain` property on various objects, but most
perniciously, every `Promise` object, in a way that SES is unable to intercept
or prevent.
These domain properties are unfrozen, so they can be used for covert
communication between tenant programs, and provide a view into dynamic scope
that any program can directly manipulate to confuse other programs.
