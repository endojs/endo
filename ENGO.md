
Endo is a framework for fearless cooperation among sandboxed JavaScript programs.
XS is a JavaScript virtual machine, designed for embedded systems, that implements the Endo sandbox.
The premise of Engo is that Endo could have its own runtime based on Go and XS, and be able to leave Node.js behind.
The runtime would not seek to be API compatible with Node.js, but compatible with Node.js module packaging.
It would provide a more object capability oriented runtime.
The resulting application would presumably attempt to have the same CLI structure as the existing Node.js CLI for the daemon.

One of the advantages of choosing Golang as the supervisor is that Go has
better foundations for operating system capabilities, like unix.Openat, which
would let us create handles for open directory descriptors, and be less sensitive to path-oriented file system race conditions.

XS supports HardenedJS compartments natively.
That is a huge win for the sandbox, since we don't need to live with the caveats of SES.
But we do need to do some work to make that developer experience nice.

For one XS currently has to be compiled for each platform.
Its debugger is a native application the developer has to compile.

We currently package XS as a XSnap application that provides a communication
protocol to a parent process that can drive behaviors like taking a resumable
heap snapshot, evaluating code, sending and receiving messages.

I would like to create a variation on XSnap that is designed for WebAssembly,
so that the communication protocol between the parent and child processes is
orchestrated with FFI calls and a region of shared memory where messages can be read and written.
For other reasons, related to Noise Protocol, the messages should have a 65,535
byte size limit regardless, so a reusable scratch space would require a tollerable fixed overhead.

For debugging, I would like to create a web-based debugging environment that hooks into XS's existing hooks.

I would like to propose official support for a WebAssembly platform in XS.

XS also lacks some important debugging features I would like to propose upstream.
The current protocol involves a platform hook for reading and writing streaming async XML (SAX).
I would like to make changes to XS that add a level of indirection between the routines that emit SAX
so that they a platform, like the WebAssembly XSnap platform, can instead turn individual debugging messages
into messages that use the same or a similar scratch space for communication as mentioned above.

Currently, this Engo prototype is using CGO to compile XSnap to a shared
library and embedding that alternate main() in its own startup, so it can shell
out to itself and switch behavior based on an environment variable.
This is very similar to how Electron embeds Node.js.
However, it is fragile and not so easily portable.
I would like to investigate WebAssembly runtimes in Go that would let us embed
the WebAssembly for XSnap as data and run XSnap virtual machines, possibly in
parallel in the same process, to take advantage of shared memory in the message
bus, or even to run some XSnap workers in child processes for isolation
purposes.

