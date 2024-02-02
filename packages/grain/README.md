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