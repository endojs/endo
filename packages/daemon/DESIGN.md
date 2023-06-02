
Endo is a user agent for running guest programs.
These programs receive capabilities from the user in the form of references to
potentially powerful local or remote objects.
Endo uses a system called Eventual Send that that stretches references to
remote objects over one or more capability transfer protocols (CapTP).
Endo is an example of the Powerbox Pattern[^powerbox].

[^powerbox]: See _The Powerbox Pattern_ from [How Emily Tamed the
    Caml][powerbox].

[powerbox]: https://www.hpl.hp.com/techreports/2006/HPL-2006-116.html

A Promise represents a result from either the past or the future.
Eventual Send displaces a result in both space and time.
That is, a program can use eventual send to uniformly interact with a result
regardless of whether the eventual result is local or remote, pending or
settled.
Furthermore, Eventual Send can pipeline[^pipeline] messages to an eventual result,
like invoking a method on the result of a prior method invocation, to avoid
unnecessary round trips through the underlying CapTP connection.

[^pipeline]: See [Mark's explanation of pipelines][pipeline-erights], the
    [Cap'n Proto explanation][pipeline-capnproto], [Wikipedia][pipeline-wikipedia], or
    the [ECMAScript standard proposal][pipeline-proposal].

[pipeline-erights]: http://erights.org/elib/distrib/pipeline.html
[pipeline-capnproto]: https://capnproto.org/rpc.html
[pipeline-wikipedia]: https://en.wikipedia.org/wiki/Futures_and_promises#Promise_pipelining
[pipeline-proposal]: https://www.proposals.es/proposals/Support%20for%20Distributed%20Promise%20Pipelining

Much hinges on what happens when a program restarts.
Like most processes, Endo workers start without any memory from their previous
run.
So, Endo programs must manually persist[^persistence] anything they wish to
remember after a restart.

[^persistence]: Aside: Manual persistence is as opposed to Orthogonal
    Persistence, where a program resumes exactly where it left off when it
    restarts, albeit it by replaying every message it recieved since the last
    snapshot or inception.  The architecture of Endo allows for Orthogonal
    Persistence to be built on top of a manually persisted worker and a durable
    reference to external storage for snapshots, message log, and virtual
    objects.

Endo applications ultimately receive all their data and powers from the Endo
daemon with the user's consent.
Endo persists **data** between restarts with a content address store in the
user's home directory.
Endo persists **powers** between restarts by storing formulas in the user's
home directory.
A formula describes how Endo should recreate and distribute a value, including
powerful capability bearing objects if it restarts.

When Endo runs a confined program, it provides a Powers object that the
confined program can use to **request** powers from the user.
The Powers object is entangled with a corresponding Inbox.
The user interacts with the Inbox to respond to requests from the Powers
holder.

Both the Inbox held by the user (host) and the Powers held by program (guest)
refer to formulas with pet names, and have separate pet name spaces.
Changing a pet name does not alter or delete the underlying formula, but a
formula that is unreachable from the user's pet names may be garbage collected.

- The program can use the Powers object to request an ephemeral value
  from the user.
  The Powers will not retain the resulting formula.

  ```js
  const file = E(powers).request('a file');
  ```

- The program can use the Powers object to request a durable value
  and give it a pet name.
  The Powers will memoize the value and retain the resulting formula.
  Endo will honor subsequent requests for the same pet name from this Powers
  object by reconstructing the value from its formula if necessary.

  ```js
  const file = E(powers).request('a file, 'fileName');
  ```

- The user can respond to pending requests by streaming requests
  from their Inbox.
  The user can resolve the request with the pet name of a formula they hold,
  giving the guest the corresponding value.
  The user can reject the request with a message.
  The user can observe whether the request is still pending, which will be
  useful for a graphical user interface.

  ```js
  for await (const request of iterateRef(E(inbox).requests())) {
    request.resolve('userPetName');
  }
  ```

- The user can create a new Powers object by calling the `makePowers`
  method of their Inbox.
  In a user interface, requests will be attributed to their pet name for the
  Powers object.

Every formula has a string identifier.
If the behavior of the formula cannot be inferred from the identifier,
Endo stores a corresponding JSON description in a key value store (tentatively
just files) indexed on the identifier.
The description instructs Endo in how to create the corresponding value.
Formulas with dependencies list the identifiers of those dependencies in a
`slots` property then refer elsewhere to those formulas by the index of the
slot.
This makes formulas transparent to a garbage collector.

- A blob formula denotes a content address hash for bytes that Endo has stored.
  Endo provides a Blob reference for that formula with methods for reading the
  text, bytes, or byte stream from the blob.

  Formula Identifier:

  ```
  readableSha512/$SHA512
  ```

  Endo stores the blob in the user's home directory, tentatively in a file with
  the same name as the formula identifier.

- A worker formula denotes the unique identifier for an Endo worker.
  Endo provides a Worker reference for the process.
  Workers can execute confined and unconfined programs and have a `terminate`
  method.

  Formula Identifier:

  ```
  workerUuid/$UUID
  ```

  Endo stores the worker's last known PID and a combined stdout and stderr log
  in a directory with the same name.

- For an evaluation formula, Endo provides the completion value of a JavaScript
  program to be run in the identified worker, confined to an Endo Compartment,
  endowed with the values for the identified formulas, bound to the given
  names.
  Endo Compartments are endowed with `E` and `Far` for sending and receiving
  messages.

  Formula Identifier:

  ```
  value/$UUID
  ```

  Formula Description:

  ```json
  {
    "type": "evaluate",
    "source": "E(worker).evaluate(E(file).text())",
    "names": ["worker", "file"],
    "values": [0, 1],
    "worker": 0,
    "slots": [
      "readableSha512/b0b5c0ffeefacade...",
      "workerUuid/b0b5-c0ffee-facade...",
    ]
  }
  ```

- For a connection formula, Endo provides a reference to a remote object.
  The formula describes the capability transfer protocol, address, and public
  key of the interlocutor.

- The inbox identifier denotes a pet name store and corresponds to an
  Inbox object.
  In a user interface, requests will be identified by the inbox's pet name for
  the powers object.

  Inbox identifier:

  ```
  inbox
  ```

  Endo will track pet names for the inbox tentatively in the home
  directory as files under a directory with the same identifier.

- A powers identifier denotes a pet name store and corresponds to a
  Powers object.

  Powers identifier:

  ```
  powers/$UUID
  ```

  Endo will track pet names for the inbox tentatively in the home
  directory as files under a directory with the same identifier.

- An unconfined plugin formula describes the path to a Node.js module that
  conventionally exports a function named `instantiate` that accepts a
  `powers` object from Endo and identifies a worker to execute the plugin in.
  For a plugin formula, Endo provides a reference to the value returned by
  `instantiate`.

- A confined application formula refers to an Endo bundle by the content
  address of a Blob object, the identifier of the worker where it should run.
  The entrypoint module of the bundle conventionally exports a function
  named `instantiate` and accepts a `powers` object from Endo.
  For a plugin formula, Endo provides a reference to the value returned by
  `instantiate`.
