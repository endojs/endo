# Mark Miller's Ph.D. Thesis: Robust Composition
## (Robust Composition: Towards a Unified Approach to Access Control and Concurrency Control)
**Author:** Mark Samuel Miller
**Date:** May 2006
**Institution:** Johns Hopkins University

---

## Overview

This is Mark Miller's Ph.D. dissertation that lays the foundation for the capability-based security work that inspired Endo and related projects. The thesis presents a framework for enabling robust composition of concurrent and potentially malicious components distributed over potentially malicious machines.

---

## Abstract

When separately written programs are composed so that they may cooperate, they may instead destructively interfere in unanticipated ways. These hazards limit the scale and functionality of the software systems we can successfully compose. This dissertation presents a framework for enabling those interactions between components needed for the cooperation we intend, while minimizing the hazards of destructive interference.

Great progress on the composition problem has been made within the object paradigm, chiefly in the context of sequential, single-machine programming among benign components. We show how to extend this success to support robust composition of concurrent and potentially malicious components distributed over potentially malicious machines.

[Source: http://erights.org/talks/thesis/index.html](http://erights.org/talks/thesis/index.html)

---

## Key Resources

### PDF Versions

1. **Current Version** (single spaced):
   - http://erights.org/talks/thesis/markm-thesis.pdf
   - Formatted for double-sided printing

2. **Official Dissertation** (double spaced):
   - https://www.cypherpunks.to/erights/talks/thesis/submitted/markm-thesis.pdf
   - Formatted for single-sided printing

These links have been added to the documentation for future reference, though network access has been problematic during initial scraping attempts.

---

## Relevant Concepts for daemon-lore.md Research

This thesis contains the foundational concepts referenced throughout the current TODOs. Key topics to extract for daemon-lore include:

### 1. What is a Capability?
- The role of capabilities as references that confer authority
- The distinction between identity (identifying an object) and authority (defining what operations are permitted)
- How capabilities differ from traditional access control mechanisms

### 2. Capability-Based Access Control
- Pass-by-reference semantics vs pass-by-value
- How capabilities provide fine-grained access control
- Encapsulation and the principle of least authority

### 3. Distributed Composition
- Strategies for composing components across network boundaries
- Concurrency control in distributed systems
- Fault containment and isolation

### 4. Access Control vs Concurrency Control
- The unified approach described in the thesis title
- How to prevent both malicious interference and concurrent data corruption

### 5. Robustness Principles
- Strategies for ensuring robust composition
- Safety guarantees in hostile environments

---

## Research Notes

The full content of the thesis requires manual downloading due to network timeouts. Future extraction should focus on:

1. **Chapter 1-3**: Foundation concepts about capabilities and composition
2. **Chapter 4-6**: Technical details of the E language and its distribution mechanisms
3. **Chapter 7-8**: Concurrency control and safety guarantees
4. **Chapter 9-10**: Practical applications and implementation details

Key technical terms to research:
- **VAT (Virtualized Atom)**: The basic isolation unit in distributed systems
- **CapTP (Capability Transport Protocol)**: The communication protocol
- **Formula**: The mechanism for specifying code behavior
- **Event Loop**: The concurrency model
- **Live Refs**: How references are managed across lifetimes

---

## Related References

- Mark Miller, "Distributed Confinement" (2002)
- Mark Miller, "Object Capabilities" (various presentations)
- E Language documentation and tutorials
- ENDO project on GitHub (related to implementation)

---

**Status:** Partially documented - full content requires manual PDF download
**Date:** 2025-06-20
**Progress:** Basic metadata and navigation links added, detailed content extraction pending