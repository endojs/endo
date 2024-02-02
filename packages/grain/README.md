Grain.js Documentation
======================

Grain.js is a JavaScript library designed for making values "remotable" over a network boundary. It simplifies accessing and modifying values synchronously or asynchronously, with support for reading, writing, subscribing to changes, and managing the lifecycle of these "grain" objects.

Features
--------

-   **Sync and Async Grains:** Create grains that store values, with synchronous or asynchronous access.
-   **Derived Grains:** Generate grains that derive their values from other grains.
-   **Array and Object Grains:** Specialized grains for arrays and object maps with convenient methods.
-   **Lifecycle Management:** Tools for managing the lifecycle of grains, including destruction to prevent memory leaks.

Installation
------------

To use Grain.js, ensure you have the dependencies `@endo/promise-kit` and `@endo/daemon/pubsub.js` installed. Then, include Grain.js in your project.

API Reference
-------------

### Basic Grain Creation

#### `makeSyncGrain(initValue)`

Creates a synchronous grain that stores a single value.

-   `initValue`: Initial value of the grain.

Returns an object with methods to get, set, update, subscribe to changes, follow changes via an async iterator, and destroy the grain.

### Array Grain

#### `makeArrayGrainFromSyncGrain(syncGrain)`

Enhances a synchronous grain to handle array values, adding methods for array manipulation.

-   `syncGrain`: A sync grain initialized with an array.

Returns a grain with array-specific methods (`getAtIndex`, `setAtIndex`, `updateAtIndex`, `push`, `pop`, `shift`, `unshift`, `splice`, `getLength`, `setLength`).

#### `makeSyncArrayGrain(initValue = [])`

Creates a grain specifically for handling arrays.

-   `initValue`: Initial array value for the grain.

### Derived and Lazy Grains

#### `makeDerivedSyncGrain(grain, deriveFn)`

Creates a derived grain that updates its value based on another grain's value transformation.

-   `grain`: Source grain.
-   `deriveFn`: Transformation function to apply to the source grain's value.

#### `makeLazyDerivedSyncGrain(grain, deriveFn)`

Creates a derived grain similar to `makeDerivedSyncGrain` but initializes lazily.

### Grain Maps

#### `makeSyncGrainMap(grains = {})`

Creates a grain that maps keys to other grains, allowing complex data structures.

-   `grains`: Initial map of keys to grains.

#### `makeSyncGrainArrayMap(grains = {})`

Similar to `makeSyncGrainMap` but ensures that the values are always initialized arrays.

### Composition and Subscription

#### `composeGrains(grains, deriveFn)`

Combines multiple grains into a single derived grain using a synchronous mapping function.

#### `makeSubscribedSyncGrainFromAsyncGrain(asyncGrain, initialValue)`

Subscribes a synchronous grain to changes from an asynchronous grain, providing real-time updates.

### Lifecycle Management

#### `makeDestroyController()`

Helper function for tracking and managing the lifecycle of grains, including a method to destroy the grain.

Usage Examples
--------------

The documentation would benefit from specific examples illustrating the creation and use of grains, derived grains, and managing subscriptions and lifecycle events. This would typically include snippets showing how to initialize grains, subscribe to updates, and perform cleanup with the destroy methods.

Design Notes
------------

The library includes considerations for extending functionality, such as making derived grains lazy and managing the intricate details of lifecycle events, especially regarding the `destroy` method's impact on subscriptions and readonly interfaces.

Conclusion
----------

Grain.js offers a robust set of tools for managing state across network boundaries, with an emphasis on flexibility, extensibility, and lifecycle management. It caters to a variety of use cases, from simple value storage to complex, derived data structures with real-time updates.

Detailed API Reference
======================

Below, we dive deeper into the interfaces of the objects returned by the key functions of the Grain.js library.

Sync Grain Interface
--------------------

Created via `makeSyncGrain(initValue)`, a Sync Grain supports basic operations to manage a single value synchronously.

### Methods

-   `get()`: Returns the current value of the grain.
-   `set(newValue)`: Sets a new value for the grain and notifies all subscribers.
-   `update(updateFn)`: Applies an update function to the current value of the grain.
-   `subscribe(handler)`: Subscribes to changes in the grain's value. The handler is called with the new value.
-   `follow()`: Returns an async iterator that yields the current and subsequent values of the grain.
-   `destroy()`: Cancels all subscriptions and prevents further reads and writes.
-   `readonly()`: Returns a read-only interface to the grain, excluding the `set`, `update`, and `destroy` methods.

Array Grain Interface
---------------------

Enhanced by `makeArrayGrainFromSyncGrain(syncGrain)`, it adds array-specific manipulation methods to a Sync Grain.

### Methods

-   Inherits all methods from the Sync Grain interface.
-   `getAtIndex(index)`: Returns the value at the specified array index.
-   `setAtIndex(index, item)`: Sets a value at the specified array index.
-   `updateAtIndex(index, updateFn)`: Applies an update function to the value at the specified array index.
-   `push(item)`: Appends an item to the array.
-   `pop()`: Removes and returns the last item of the array.
-   `shift()`: Removes and returns the first item of the array.
-   `unshift(item)`: Adds an item to the beginning of the array.
-   `splice(index, length)`: Removes elements from the array and, if necessary, inserts new elements.
-   `getLength()`: Returns the length of the array.
-   `setLength(length)`: Sets the length of the array, truncating or expanding as necessary.

Derived Grain Interface
-----------------------

Derived grains are created through functions like `makeDerivedSyncGrain(grain, deriveFn)` and offer a read-only view of a transformed source grain.

### Methods

-   `get()`: Retrieves the current, derived value of the grain.
-   `subscribe(handler)`: Subscribes to changes in the derived value.
-   `follow()`: Returns an async iterator for the derived value, yielding the current and subsequent derived values.
-   `readonly()`: Further asserts the read-only nature of the derived grain, effectively a no-op as derived grains are read-only by design.

Grain Map Interface
-------------------

Produced by `makeSyncGrainMap(grains = {})`, a Grain Map manages a collection of grains mapped by keys.

### Methods

-   `hasGrain(key)`: Checks if a grain exists for the given key.
-   `getGrain(key)`: Retrieves the grain associated with the given key.
-   `setGrain(key, grain)`: Associates a new grain with the given key.
-   `destroy()`: Destroys the grain map, including all managed grains.

Sync Grain Array Map Interface
------------------------------

Created with `makeSyncGrainArrayMap(grains = {})`, it specializes in managing a map where each value is an array grain.

### Methods

-   Inherits all methods from the Grain Map interface.
-   `push(key, item)`: Adds an item to the array grain associated with the given key.

General Usage Pattern
---------------------

For all grains, the usage pattern involves creation, interaction through methods (e.g., `get`, `set`, `subscribe`), and lifecycle management (e.g., `destroy` to clean up resources). Derived and lazy grains allow for efficient, on-demand computation and subscription models, supporting complex data relationships and real-time updates.

This detailed interface documentation should help developers understand how to effectively use the Grain.js library to manage state in their applications, enabling powerful patterns for synchronizing and transforming data across network boundaries.