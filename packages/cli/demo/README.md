
# Install Endo

One day, this will be as simple as:

> npm install -g @endo/cli

Until that day, you will need to clone the Endo repository, install
dependencies using Yarn, and arrange for the Endo command to be available as
`endo` in whatever shell you favor.

```
> git clone https://github.com/endojs/endo.git
> yarn
> alias endo=$PWD/packages/cli/bin/endo
```

# A counter example

This is a worker caplet, or worklet, that counts numbers.

```js
import { makeExo } from '@endo/exo';

export const make = () => {
  let counter = 0;
  return makeExo(
    'Counter',
    M.interface('Counter', {}, { defaultGuards: 'passable' }),
    {
      incr() {
        counter += 1;
        return counter;
      },
    }
  );
};
```

We can create an instance of the counter and give it a name.

```
> endo make counter.js --name counter
```

Then, we can send messages to the counter and see their responses.
These `endo eval` commands are executing a tightly confined JavaScript program
and reporting the program's completion value.
Because of the confinement to a private Hardened JavaScript Compartment,
the program must be endowed with all of its dependencies,
in this case, a `counter`.

```
> endo eval 'E(counter).incr()' counter
1
> endo eval 'E(counter).incr()' counter
2
> endo eval 'E(counter).incr()' counter
3
```

> Aside: in all the above cases, we use `counter` both as the property name
> that will appear in the compartment's global object (and global scope) as
> well as the name of formula that produced the value.
> These may be different.
>
> ```
> > endo eval 'E(c).incr()' c:counter
> 4
> ```

Endo preserves the commands that led to the creation of the `counter` value,
which form a directed acyclic graph of "formulas".
If we kill the Endo Pet Daemon and all its workers (or "vats"), the memory
of how these values were made remains, but their memory is otherwise lost.

```
> endo restart
> endo eval 'E(counter).incr()' counter
1
> endo eval 'E(counter).incr()' counter
2
> endo eval 'E(counter).incr()' counter
3
```

> Aside, since Eventual Send, the machinery under the `E` operator, abstracts
> the counter reference in both space and time, it does not matter much which
> process these evaluations occur in.
> The default is a worker called `MAIN`, whose formula number is 0.
> Use the `-w` or `--worker` flag to specify a different worker.
>
> ```
> > endo spawn greeter
> > endo eval --worker greeter '"Hello, World!"' --name greeting
> Hello, World!
> > endo show greeting
> Hello, World!
> ```

# Doubler Agent

The counter example requires no additional authority.
It provides a simple service and depends only on the ability to compute.

The doubler worklet depends upon a counter, which it doubles.
We can use the doubler to demonstrate how caplets can run as guests
and request additional capabilities from the user.

```js
import { E } from '@endo/far';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

export const make = powers => {
  const counter = E(powers).request(
    'HOST',
    'a counter, suitable for doubling',
    'my-counter'
  );
  return makeExo(
    'Doubler',
    M.interface('Doubler', {}, { defaultGuards: 'passable' }),
    {
      async incr() {
        const n = await E(counter).incr();
        return n * 2;
      },
    }
  );
};
```

The doubler receives a `powers` object: an interface granted by the host user
through which it obtains all of its authority.
In this example, the doubler requests another counter from the user.

We make a doubler mostly the same way we made the counter.
However, we must give a name to the agent running the doubler, which we will
later use to recognize requests coming from the doubler.

```
> endo mkguest doubler-agent
> endo make doubler.js --name doubler --powers doubler-agent
```

This creates a doubler, but the doubler cannot respond until we
resolve its request for a counter.

```
> endo inbox
0. "doubler-agent" requested "please give me a counter"
> endo resolve 0 counter
```

> Aside, `endo reject 0` would have rejected the request,
> leaving the `doubler-agent` permanently broken.

Now we can get a response from the doubler.

```
> endo eval 'E(doubler).incr()' doubler
8
> endo eval 'E(doubler).incr()' doubler
10
> endo eval 'E(doubler).incr()' doubler
12
```

Also, in the optional second argument to `request`, `doubler.js` names the
request `my-counter`.
Any subsequent time a worklet running with the powers of `doubler-agent` asks
for a power using the name `my-counter`, it will get a reference to the same
eventual response.
The daemon preserves the formulas needed to recreate `my-counter` across
restarts and reboots.

```
> endo restart
> endo eval 'E(doubler).incr()' doubler
2
> endo eval 'E(doubler).incr()' doubler
4
> endo eval 'E(doubler).incr()' doubler
6
```

# Sending Messages

So far, we have run guest programs like the doubler.
Guests and hosts can exchange messages and those messages can convey powerful
objects.

In this example, we create a fake guest named "alice" and we send them our
"doubler".
Then, assuming the guise of "alice", we find the message in our inbox
and adopt the "doubler" object into our own store.

```
> endo mkguest alice
> endo send alice 'Please enjoy this @doubler.'
> endo inbox --as alice
0. "HOST" sent "Please enjoy this @doubler."
> endo adopt --as alice 0 doubler
> endo list --as alice
doubler
> endo dismiss --as alice 0
```

# Names in transit are no-one's names

Sending a message with the `@name` notation means that the recipient
will see the name we chose for the object.
This is convenient in the common case, but not necessary.
The sender can choose a different name for the capability they send with the
notation `@name-they-see:name-we-have`.
Then, the receiver may choose to adopt the capability with a different name of
their own.

In this example, we send alice our "doubler" but let it appear as merely
"counter" in the message body.
Then, alice adopts "counter", giving it their own name, "redoubler".

```
> endo send alice 'Please enjoy this @counter:doubler.'
> endo inbox --as alice
1. "HOST" sent "Please enjoy this @counter."
> endo adopt --as alice 1 counter --name redoubler
> endo list --as alice
redoubler
> endo dismiss --as alice 1
```

# Mailboxes are symmetric

Guests can also send their host messages.
In this example, "alice" send the doubler back to us, their host.

```
> endo send HOST --as alice 'This is the @doubler you sent me.'
> endo inbox
0. "alice" sent "This is the @doubler you sent me."
> endo adopt 0 doubler doubler-from-alice
> endo dismiss 0
```

For a guest, the reserved name HOST refers to their host.
For both hosts and guests, SELF is the name of their own powers object.

# Familiar Chat

The pet daemon (or familiar, if you will) maintains a petstore and mailbox for
each agent, like you (the host), and all your guests (like the doubler-agent).
The `endo list` command shows you the pet names in your pet store.
The `endo inbox` command (and `endo inbox --follow` command), shows
messages from your various guests.

Weblets are web page caplets.
These are programs, like the counter and doubler above, except that
they run in a web page.
Each of these applications is connected to the pet daemon and can make
the same kinds of requests for data and powers.
Each weblet runs on a separate local HTTP port so they have independent
origins, so they own their local storage.

_Familiar Chat_ is an example application that provides a web app for
interacting with your pet daemon.

```
> endo install cat.js --listen 8920 --powers SELF --name familiar-chat
```

This command creates a web page named familiar-chat and endows it with the
authority to maintain your petstore and mailbox.
You can then open that page.

```
> endo open familiar-chat
```

So, if you were to simulate a request from your cat:

```
> endo mkguest cat
> endo request 'pet me' --as cat
```

This will appear in your Familiar Chat web page, where you can resolve
or reject that request with any value you have a pet name for.
For example, in your web browser, you will see something like:

> ## Familiar Chat
> 1. *cat* requests "pet me" `[      ]` `[resolve]` `[reject]`

If you enter the name `counter` and press `[resolve]` and return to your
terminal, you will see that the `endo request 'pet me' --as cat` command has
received the counter and exited.

> ## Familiar Chat
> 1. *cat* requests "pet me" _fulfilled_

# Running a confined script

Beyond weblets and worklets, a runlet is more like a `node` script:
it runs in your shell and interacts with you directly, not in a supervised
worker process behind the scenes.
But, like other caplets, it is fully confined and only receives the powers
you have granted.
They can also receive additional command line arguments.

Instead of exporting a `make` function, a runlet exports a `main` function
with a slightly different signature.

```js
export const main = async (powers, ...args) => {
  console.log('Hello, World!', args);
  return 42;
};
```

If a runlet returns a promise for some value, it will print that value
before exiting gracefully.

```
> endo run runlet.js a b c
Hello, World! [ 'a', 'b', 'c' ]
42
```
