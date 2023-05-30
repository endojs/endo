
Endo is a user agent for running guest programs.
These programs receive capabilities from the user in the form of references to
powerful remote objects.
To that end, Endo exhibits a system called Eventual Send that stretches
references to remote objects over any capability transfer protocol (CapTP).
A Promise represents a result from either the past or the future, and Eventual
Send enables programs to interact with those eventual results, even if they are
in another worker or on the far side of a network.
Furthermore, Eventual Send allows messages to be pipelined to these eventual
results to overcome any latency that might otherwise accrue if the program
waited for each intermediate result before sending a follow-up message.

Much hinges on what happens when a program restarts.
Like most programs, Endo workers start from the beginning of a program and
retain no memory of their previous run.

Endo applications ultimately receive all their powers from the user.
They receive a "powerbox" object from the user they can use to petition the
user for access to additional resources including capability-bearing objects,
including remote objects, including remote objects from other peers.
The program may give these resources "pet names", such that if in the future
the program asks for a resource with the same pet name, the Endo Daemon will
attempt to renew whatever resource the user previously granted.

Likewise, the Endo user holds their own powerbox and can assign their own pet
names to any value they receive from a worker or peer for future reference.

A powerbox and inbox has the following methods:

- a method to request an ephemeral resource
- a method to request a renewable resource with a given pet name
- a method that returns a stream of requests from the connected party

An Endo worker must manually persist any state they wish to restore when they
restart.
This can be accomplished by requesting a renewable resource from the user
where they can store state and retrieve state.

> Aside: Manual persistence is as opposed to Orthogonal Persistence, where a
> program resumes exactly where it left off when it restarts, albeit it by
> replaying every message it recieved since the last snapshot or inception.
> The architecture of Endo allows for Orthogonal Persistence to be built on top
> of a manually persisted worker and renewed access to external storage for
> snapshots, message log, and virtual objects.

Endo stores recipes for renewing resources, keyed either by a content address
(hash), (probably) universally unique identifier, or the means to connect to a
remote resource and verify its integrity.
Resources include:

- blobs (by hash)
- workers (by identifier)
- values (by identifier), produced by evaluating a JavaScript `[[Program]]`
  in a `Compartment`, in a `Worker`, endowed with other identified values.
- agents (by connectivity), each with their own powerbox and inbox,
  for example an address to connect to, the kind of capability transfer
  protocol to use, and the public key of the interlocutor if over a public
  network.

Endo also stores pet names, which are references to resources, but keyed on the
name itself, which the user may reuse for a different resource.
Resources do not refer amongst themselves using these pet names.

The Endo Daemon is a background process that runs on behalf of a user and
persists state in that user's home directory.
The Endo Daemon is responsible for:

- supervising other guest applications,
- safely hosting web based user interfaces for guest applications,
- mediating the distribution of the user's resources including storage,
  compute, and communication,
- remembering the user's decisions between restarts,
- remembering the names the user assigns to objects,
- remembering the edge names other agents ascribe to objects so a user can make
  an informed descision when adopting their own pet name.

Agoric provides Endo for treble purposes.
First, to provide a foundation of a peer to peer web.
Second, as a playground for learning how to use Eventual Send that does not
presuppose familiarity with Orthogonal Persistence or require a blockchain.
Third, to provide a container for running programs off-chain that communicate
with on-chain programs (smart contracts) with Eventual Send.
