# Bejar Box Specification

**Table of Contents**

1. **Background**
   - 1.1 What is CapTP?
   - 1.2 The Need for Distributed Garbage Collection
   - 1.3 Introduction to Bejar Box

2. **Understanding Bejar Box**
   - 2.1 Conceptual Overview
   - 2.2 How It Differs from Standard Garbage Collection

3. **Designing the Bejar Box Specification**
   - 3.1 Objectives
   - 3.2 Key Components
   - 3.3 Algorithms and Data Structures

4. **Implementing Bejar Box in JavaScript**
   - 4.1 Environment Setup
   - 4.2 Code Structure
   - 4.3 Handling Weak References
   - 4.4 Communication Between Vats

5. **Testing and Validation**
   - 5.1 Simulating Distributed Object Graphs
   - 5.2 Detecting and Collecting Garbage Cycles

6. **Challenges and Considerations**
   - 6.1 Dealing with Uncooperative Vats
   - 6.2 Performance Implications
   - 6.3 Security Concerns

7. **Conclusion**

---

## 1. Background

### 1.1 What is CapTP?

CapTP (Capability Transport Protocol) is a protocol for sharing object references (capabilities) across different computational contexts known as "vats". These vats are similar to actors in the Actor Model but with the added complexity of sharing object references and passing them back and forth as parameters to functions on those objects.

### 1.2 The Need for Distributed Garbage Collection

In a distributed system like CapTP, objects may hold references to objects in other vats, creating a complex web of interdependencies. This can lead to distributed reference cycles, which standard local garbage collectors cannot clean up, potentially causing memory leaks.

### 1.3 Introduction to Bejar Box

A "Bejar Box" is a conceptual tool designed to aid in the garbage collection of distributed object graphs in CapTP. It maintains lists of "entrance" and "exit" references and provides notifications when an exit reference becomes unreachable from any entrance reference. This allows for proactive cleanup of distributed cycles.

## 2. Understanding Bejar Box

### 2.1 Conceptual Overview

- **Entrance References**: Strong references that are considered roots for garbage collection purposes.
- **Exit References**: Objects that may become garbage if they are no longer reachable from any entrance reference.
- **Bejar Box Functionality**: Monitors the reachability of exit references from entrance references and triggers events when exits become unreachable.

### 2.2 How It Differs from Standard Garbage Collection

Standard garbage collectors operate within a single runtime environment and cannot detect cycles that span multiple vats. The Bejar Box extends garbage collection capabilities by:

- Tracking cross-vat references.
- Providing a mechanism to detect when an object is no longer reachable from any root across the distributed system.
- Enabling cooperative garbage collection between vats.

## 3. Designing the Bejar Box Specification

### 3.1 Objectives

- **Detect Distributed Garbage Cycles**: Identify when objects are no longer reachable across vats.
- **Efficient Communication**: Minimize overhead in detecting unreachable objects.
- **Integrate with CapTP**: Seamlessly work within the CapTP protocol and existing vat implementations.

### 3.2 Key Components

1. **Entrance List**: A list of strong references acting as roots.
2. **Exit List**: A list of objects that are potential garbage candidates.
3. **Reachability Map**: Data structures to track reachability between entrances and exits.
4. **Notification Mechanism**: Events or callbacks that trigger when an exit becomes unreachable.

### 3.3 Algorithms and Data Structures

- **Weak References**: Use weak references to allow the garbage collector to collect objects when they become unreachable.
- **Graph Traversal**: Implement algorithms to traverse the object graph across vats.
- **Reference Counting (Enhanced)**: Utilize a form of reference counting that accounts for distributed references, avoiding standard pitfalls like failing to detect cycles.

## 4. Implementing Bejar Box in JavaScript

### 4.1 Environment Setup

- **JavaScript Runtime**: Use Node.js or a compatible environment that supports weak references (e.g., `WeakRef`, `FinalizationRegistry`).
- **CapTP Library**: Ensure you have a CapTP implementation to work with or simulate vats.

### 4.2 Code Structure

- **BejarBox Class**: Encapsulate the functionality within a class or module.
- **Entrance and Exit Management**: Methods to add or remove entrances and exits.
- **Event Handling**: Use EventEmitter or a similar pattern to handle notifications.

### 4.3 Handling Weak References

```javascript
class BejarBox {
  constructor() {
    this.entrances = new Set();
    this.exits = new WeakSet();
    this.finalizationRegistry = new FinalizationRegistry((exit) => {
      // Handle unreachable exit
      this.onExitUnreachable(exit);
    });
  }

  addEntrance(entrance) {
    this.entrances.add(entrance);
  }

  removeEntrance(entrance) {
    this.entrances.delete(entrance);
  }

  addExit(exit) {
    this.exits.add(exit);
    this.finalizationRegistry.register(exit, exit);
  }

  onExitUnreachable(exit) {
    // Notify that exit is unreachable
    console.log('Exit became unreachable:', exit);
    // Perform cleanup or send messages to peers
  }
}
```

### 4.4 Communication Between Vats

- **Message Passing**: Implement protocols for vats to communicate about object reachability.
- **Reference Lists**: Each vat maintains its own Bejar Box, and vats exchange information about entrances and exits.
- **Cleanup Coordination**: When an exit is unreachable, send messages to other vats to allow them to release references.

## 5. Testing and Validation

### 5.1 Simulating Distributed Object Graphs

- **Mock Vats**: Create simulated vats in your testing environment.
- **Object References**: Pass objects between vats to create distributed reference graphs.

### 5.2 Detecting and Collecting Garbage Cycles

- **Create Cycles**: Intentionally create reference cycles across vats.
- **Monitor Garbage Collection**: Ensure that unreachable cycles are detected and collected.
- **Logging and Debugging**: Use extensive logging to trace the lifecycle of objects.

## 6. Challenges and Considerations

### 6.1 Dealing with Uncooperative Vats

- **Trust Model**: The Bejar Box assumes cooperative vats. In environments where vats may be untrusted, additional mechanisms are needed.
- **Timeouts and Leases**: Implement time-based mechanisms to eventually collect objects if a vat becomes unresponsive.

### 6.2 Performance Implications

- **Overhead**: Monitoring object reachability can introduce overhead.
- **Optimization**: Use efficient data structures and minimize the frequency of checks.

### 6.3 Security Concerns

- **Denial of Service**: Ensure that the garbage collection mechanism cannot be exploited to overload the system.
- **Information Leakage**: Be cautious about the information shared between vats during garbage collection.

## 7. Conclusion

Implementing a Bejar Box for CapTP garbage collection involves:

- Understanding the challenges of distributed garbage collection.
- Designing a system that tracks entrances and exits across vats.
- Implementing the system in JavaScript using modern features like `WeakRef` and `FinalizationRegistry`.
- Testing the system thoroughly to ensure it correctly identifies and collects unreachable distributed object cycles.

---

**Additional Resources**

- **EC Distributed Garbage Collector**: Review the white paper for insights into distributed garbage collection algorithms.
- **JavaScript Weak References**: Explore MDN documentation on `WeakRef` and `FinalizationRegistry`.
- **CapTP Protocol Details**: Familiarize yourself with the specifics of CapTP to ensure seamless integration.
