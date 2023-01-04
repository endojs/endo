# Where is Endo?

This package provides a utility for finding the user files and Unix domain
socket or Windows named pipe for the Endo daemon.
The Endo user directory stores the per-user runtime data for Endo,
including logs and other application storage.

Endo attempts to use or infer [Cross-desktop XDG conventions][XDG] paths in
every meaningful way.
Windows named pipes do not appear to fit this model.
Otherwise falls back to the native conventions on Windows and Mac/Darwin.
On Windows, Endo does not use separate state and cache directories and does not
yet sync state between home directories.

[XDG]: https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html
