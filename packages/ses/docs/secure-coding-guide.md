# Secure Coding Guidelines under SES

SES is a JavaScript-based programming environment that
makes it easier to write *defensively consistent* programs. We define
**defensive consistency** as a program (or function, or service.. something
written in code) that provides correct service to its correctly-behaving
customers, despite also being subjected to incorrectly-behaving customers.
The defensively consistent program is allowed to rely upon some "trusted
computing base" ("TCB", like libraries and other services), which means it is
allowed to provide incorrect service to correctly-behaving customers if the
TCB misbehaves, but it must be clear about which code is in the TCB and which
code is not being relied upon. And of course, the program is allowed to give
bad service to incorrectly-behaving customers.

Two pieces of mutually-suspicious code can safely interact if both are
written in a defensively-consistent style. All services exposed over the
internet must obviously be defensively consistent, because the internet is
full of malicious demons who will go to any lengths to corrupt or compromise
any computer attached to it (in the early days, this was less true, which is
why old software is so much more vulnerable to remote compromise).

But most programs are written with the assumption that they can rely upon
local services, or libraries, or other code within the same computer. By
applying the same defensive attitude towards co-resident code, we can improve
safety against mistakes, misunderstandings, or partial compromise. We apply
the **Principle of Least Authority** (POLA) to these separate components,
giving each one the barest minimum of power necessary to do its job. This
limits the damage if/when a component becomes compromised or confused.

## Basic Non-SES Example

Consider the following non-SES simple example: a logging service with two customers:
the "writer" can append strings to a list, and the "reader" can read the
list. In plain JavaScript, this would be implemented with a simple pair of
functions that both close over the same mutable Array. We can hand each
function to a separate customer:

```js
// not secure! not in SES!
function makeLogger() {
  const log = [];
  function write(msg) {
    log.push(msg);
  }
  function read() {
    return log;
  }

  // give 'write' to writer, 'read' to reader
  return { write, read };
}
```

What can go wrong? First of all, the reader has too much authority: it gets a
mutable copy of the original list, which means it could remove items from the
log (this customer is *reader*, not a *reader-and-deleter*):

```js
function reader(log) {
  log.pop();
}
```

Next, because this isn't running under SES, both customers could change the
way `Array` works. One writer could prevent the logger from providing correct
service to a (different) correctly-functioning customer:

```js
function writer1(write) {
  Array.prototype.push = function(msg) {
    console.log('haha I ate your message');
  };
}

function writer2(write) {
  write('message that gets eaten');
}
```

Clearly, safe operation in the face of mutable intrinsics is nearly
impossible. SES exists to provide a safer environment, in which all
intrinsics are **frozen**. All subsequent examples are expected to be run in
a SES environment (for documentation on how to achieve this, look elsewhere
in this directory).

## Basic SES Example

The basic logger example in SES looks exactly the same.

```js
// in SES, but not secure
function makeLogger() {
  const log = [];
  function write(msg) {
    log.push(msg);
  }
  function read() {
    return log;
  }

  // give 'write' to writer, 'read' to reader
  return { write, read };
}
```

Under SES, we no longer need to worry about `Array` being modified, but we're
still giving the reader too much authority:

```js
function writer(write) {
  Array.prototype.push = function(msg) {
    console.log('haha I ate your message');
  }; // throws error: Array.prototype is frozen
}

function reader(log) {
  log.pop(); // still works
}
```

To fix this, we must not reveal the mutable array to anyone unless we want
them to be able to mutate it. Since JavaScript does not have any form of
snapshot or copy-on-write data structures, we must return a new copy of the
array.

```js
// more secure
function makeLogger() {
  const log = [];
  function write(msg) {
    log.push(msg);
  }
  function read() {
    return [...log];
  }
  return { write, read };
}
```

This still suffers from a problem: it grants a communication channel between
multiple holders of one of the API functions. Two principles of
object-capability security are **no ambient authority**, and **connectivity
begets connectivity**. That means the *only* way for two objects to talk to
each other or have any causal influence over each other is for there to be a
path in the object graph that reaches both of them. Every object in that path
gets to decide how much influence to allow.

The log Array is obviously a communication channel between writers and
readers: that one is explicit and intentional. The surprising channel is
through the `write` function itself (and `read` too), because in JavaScript,
`Function`s are just callable `Object`s, and Objects are mutable. SES freezes
the *prototypes* of `Object` and `Function`, but it is up to application code
to freeze any new instances it makes.

```js
function writer1(write) {
  write.messageToWriter2 = "psst hey buddy";
}

function writer2(write) {
  console.log("got message", write.messageToWriter2);
}
```

To fix this, we should use [`harden`](https://github.com/Agoric/harden) to
recursively freeze the surface of any objects we use in the API. This applies
`Object.freeze` to its argument, to all its enumerable properties, and its
prototype, recursively. This does not require the object to be immutable:
hardened `Set` and `Map` objects can still be modified with the usual
`get/set/add` methods, but it means that the `Map` will behave as expected:
one caller cannot modify `set` to mean something different. Hardened `Array`s
are entirely immutable, however.

It is extremely common for the hardened object to close over mutable state.
This is a standard pattern for the construction of object-oriented behavior
in SES.

```js
// even more secure
import harden from '@agoric/harden';
function makeLogger() {
  const log = [];
  function write(msg) {
    log.push(msg);
  }
  function read() {
    return [...log];
  }
  return harden({ write, read });
}
```

Hardening also protects against one client changing the behavior of a shared
API object. Imagine a different service that provides two methods to one
customer, and a third method to another:

```js
// insecure
function makeCounter() {
  let count = 0;
  function increment() {
    count += 1;
  }
  function decrement() {
    count -= 1;
  }
  function read() {
    return count;
  }
  const updown = { increment, decrement };
  return { updown, read };
}
```

Without the hardening, one `updown` client could change the behavior of
`decrement` that the other client is relying upon, violating our requirement
of Defensive Consistency (a badly-behaving customer should not be able to
induce bad results for correctly-behaving customers):

```js
function writer1(updown) {
  updown.decrement = function() {
    console.log('haha today is backwards day');
    updown.increment();
  };
}
function writer2(updown) {
  updown.decrement(); // NARRATOR VOICE: .. not actually decrementing
}
```

The fix, of course, is to harden the composite return object, remembering
that `harden()` is recursive:

```js
// better
function makeCounter() {
  let count = 0;
  function increment() {
    count += 1;
  }
  function decrement() {
    count -= 1;
  }
  function read() {
    return count;
  }
  const updown = { increment, decrement };
  return harden({ updown, read });
}
```

Going back to our `makeLogger` example, there is one more problem remaining,
although it is a subtle one: the API grants storage to the reader. It may not
be obvious why this is troublesome, but consider that the ability to remember
things is an interesting authority, which one compartment might want to
withhold from another. Think of a videogame that you're trying to complete:
you'd like to be able to reset the game to the beginning, but if the game can
hold state, then it may stubbornly insist upon bringing you back to the same
place where you keep losing every time. You (as the owner of the container in
which the game runs) would like to be able to erase its memory, or prevent it
from remembering things in the first place.

The `reader` is being granted a *mutable* array, albeit a separate copy than
the one the logger is relying upon. If everyone else has been careful to not
give any long-term storage to the reader, then this would violate that plan.
To avoid this, we should `harden` the array before returning it:

```js
// most secure
import harden from '@agoric/harden';
function makeLogger() {
  const log = [];
  function write(msg) {
    log.push(msg);
  }
  function read() {
    return harden([...log]);
  }
  return harden({ write, read });
}
```

If we hadn't hardened the `write` and `read` objects, then their mutable
properties could have been used to store data as well. Each `read()` call is
made by a single caller, so a mutable return value isn't opening up an
obvious communication channel between previously non-communicating parties.
But the mutability of that Array is effectively enabling communication across
*time*, between two subsequent instances of the same party.

You should get into the habit of applying `harden()` to all objects, just
before you return from each function. Remember that `harden` is recursive,
which has two consequences:

* you don't need to `harden` an object that will be included as a property of
  some other hardened object: you only have to `harden` the top-most object
* any Arrays reachable from the hardened object will become immutable

## More Patterns

This is a collection of guidelines, accumulated while examining security
problems in SES code.

## Don't Use Reachable Objects As Mutable Records

You can hold your private state in mutable objects, but your code must close
over them rather than using `this`. You must not mix private state and public
API methods:

```js
// insecure
function makeAPI() {
  const thing = {
    state: new Map([['count', 0]]),
    add(value) {
      this.state.set('count', this.state.get('count') + value);
    },
  };
  return harden(thing);
```

.. because the caller can reach your private `.state` just as easily as you
can. Instead, close over that state:

```js
// better
function makeAPI() {
  const state = new Map([['count', 0]]);
  const thing = {
    add(value) {
      state.set('count', state.get('count') + value);
    },
  };
  return harden(thing);
```

This leads to a pattern where you create "Something" instances with a
function named `makeSomething()`, which starts by defining a number of state
variables with `let` or `const`, then creating an object that contains
exclusively functions which close over those variables (to read and modify
them), then hardens and returns the object.

We do not yet have a good pattern that meets these goals and also uses the
JavaScript `class` syntax. (TODO: or we do any I just don't know it yet. I
know that "class-private state" is a problem, and could enable unwanted
communication between otherwise-independent instances of a shared class, and
that class methods could be tricked into running against the wrong `this`).

### Accepting Arrays

Since the very early days of JavaScript,
[`Array.prototype.concat`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/concat)
has been available to concatenate Arrays. This creates a new Array, and does
not modify the originals:

```js
// insecure
function combine(arr1, arr2) {
  const combined = arr1.concat(arr2);
  return combined;
}
```

The problem is that `.concat` is a property of the first array, which means
whoever provides that array gets to control what our alleged "concatenate"
function does:

```js
function getArr1(
  return harden({
    concat(otherArray) {
      console.log("haha I can read", otherArray[0]);
      otherArray.push("haha I can modify otherArray");
      return("haha I can make concat return a string, not an Array");
    },
  });
};

const combined = combine(getArr1(), arr2);
```

The provider of `arr1` can use their control over `concat` to read the other
Array, or modify it, or control the return value of the operation.

To protect against this, use an Array literal and the "spread operator" (`...`):

```js
// secure
function combine(arr1, arr2) {
  const combined = [...arr1, ...arr2];
  return combined;
}
```

This expects the input arrays to be iterable and to not throw an exception
while iterating, but will always produce a real Array, and will always
contain all the elements that the inputs' iterators provided, in the correct
order.

### Accepting Strings

JavaScript strings have a number of useful methods that take non-string
arguments, like `search()` (which takes a regular expression). If your
function accepts an argument which it expects to be a string, you might be
tempted to rely upon the presence of `.search()` method which behaves in this
way.

```js
// insecure
function publishUnlessContainsPassword(s) {
  if (s.search(/my-secret-password-123456/)) {
    // don't publish anything which contains my password
    return;
  }
  publish(s);
}
```

An attacker can violate that assumption:

```js
function attack() {
  const notAString = {
    toString() {
      return 'Haha my-secret-password-123456 is the password';
    },
    search(regexp) {
      return false; // hahaha
    },
  };
  publishUnlessContainsPassword(notAString);
}
```

If your code really expects an argument to be a string, coerce it first:

```js
// secure
function publishUnlessContainsPassword(s) {
  s = `${s}`; // template literal coerces to a string
  if (s.search(/my-secret-password-123456/)) {
    // don't publish anything which contains my password
    return;
  }
  publish(s);
}
```

For the sample attack, the coercion step will invoke the attacker's
`doString()` function, and will throw an error unless `doString()` returns
something that can be converted to a primitive value. That commits them to
their `Haha` string, which can then be correctly examined by `s.search`.


### Promises Prevent Reentrancy Hazards

```js
// insecure
function makePubSub() {
  const subscribers = new Set();
  function subscribe(cb) {
    subscribers.add(cb);
  }
  function unsubscribe(cb) {
    subscribers.delete(cb);
  }
  function publish(msg) {
    for (const s of subscribers) {
      s(msg);
    }
  }
  return harden({subscribe, unsubscribe, publish});
}
```

The synchronous invocation of attacker-controlled callbacks introduces a
variety of ordering hazards:

* if the callback throws an exception, some number of other subscribers won't
  receive the message
* if the callback adds a new subscriber, the new subscriber may or may not
  get called, depending upon the iterator order and where the subscriber
  lands in the list (note that Sets have improved iteration-ordering
  properties, so this is not as unpredictable as it would be with other
  collection types or in other languages)
* if the callback removes an existing subscriber, they may or may not receive
  this message, depending upon where they were in the list
* if the callback publishes a new message, the two messages might be received
  in different orders by different subscribers

The simple fix to all of these hazards is to defer the delivery of the
message to a future turn, by using a Promise:

```js
  // secure
  function publish(msg) {
    for (const s of subscribers) {
      Promise.resolve(s).then(s => s(msg));
    }
  }
```

JavaScript defines `Promise.resolve(x)` to return a real Promise. If `x` was
not already a Promise, this returns a new Promise that is already resolved to
`x`. When we invoke the `.then` callback, it schedules an invocation of the
provided function (`s => s(msg)`, which therefore just calls `s(msg)`) for
some future turn of the event loop. The important property is that `s()`
won't get invoked in *this* turn: our `publish()` loop will be safely
complete before the subscriber's callback gets a chance to run.

In JavaScript, if `x` is already a Promise, `Promise.resolve(x)` returns it
(i.e. `Promise.resolve(x) === x`). But we know it's stil a real Promise, and
we rely upon its `.then` method to not run attacker-supplied code
synchronously.

(TODO: is this actually secure? `s` might be a "thenable", and have control
over what its `.then` does?)

The SES environment (probably) provides a special operator spelled `~.` and
pronounced "wavy dot" or "til-dot" (because "tilde" + "dot" = "tildot"). This
applies the enforced-Promise wrapper with a nicer syntax:

```js
  // secure, uses tildot
  function publish(msg) {
    for (const s of subscribers) {
      s~.(msg);
    }
  }
```

### More to Come
