---
'ses': minor
'@endo/compartment-mapper': minor
'@endo/import-bundle': minor
---

Add support for host module exits in bundled compartments.

`ses` exports a new `StrictModuleDescriptor` type that consists only of the
`NamespaceModuleDescriptor` and `SourceModuleDescriptor` shapes mutually
supported by SES and XS.

`compartment-mapper` lets arbitrary module descriptors pass through
`importHook` when no policy is in effect for that edge (the
policy-enforcement runtime was previously limited to virtual module sources).
It also implicitly treats any module specifier with a URL-scheme prefix
(like `node:fs`) as an exit module when bundling, removing the need for an
additional bundler flag in the common case.

`import-bundle` threads the `importHook` option through to the underlying
compartment so that bundled applications can route exits to host-provided
implementations at import time.
Host-provided modules must be hardened and pure to avoid being a
side-channel or man-in-the-middle attack surface between guests.
