# ADR-XXXX: [Title]

**Status:** [Draft | Accepted | Superseded]  
**Author:** [Name] ([Role])  
**Date:** YYYY-MM-DD  
**CTD Anchor:** [§N — Section Name] (if applicable)  
**Supersedes:** [ADR-NNNN | None]

---

## Context

[Describe the decision context, the problem being solved, and why a decision is needed.]

---

## Options Considered

### Option A: [Name]

[Description of the option]

**Advantages:**
- [List advantages]

**Disadvantages:**
- [List disadvantages]

### Option B: [Name]

[Description of the option]

**Advantages:**
- [List advantages]

**Disadvantages:**
- [List disadvantages]

---

## Decision

[State the decision clearly. One-line summary if complex.]

---

## Rationale

[Explain why this decision was made. Compare options, state the driving factors.]

---

## What Changes

[List the specific changes this decision requires:]
- [File/module/API changes]
- [Schema changes]
- [New components or boundaries]

---

## Consequences

### Positive
- [Benefits of this decision]

### Negative
- [Costs, limitations, or trade-offs]

### Neutral
- [Side effects that are neither positive nor negative]

---

## Acceptance Signals

[Define the observable evidence that proves this ADR has been correctly implemented and is working as designed. These are NOT implementation steps — they are the test-strategy-level signals that confirm success.]

**Contract-tier signals** (what conformance tests verify):
- [Specific contract-level property that can be tested in isolation]
- [Example: "The AppendProtocol rejects writes after fsync" (ADR-0002)]

**Component-tier signals** (what integration tests verify):
- [Observable behavior at the component boundary]
- [Example: "Router policy evaluation returns expected verdicts per trust tier" (ADR-0006)]

**Acceptance-tier signals** (what end-to-end scenarios verify):
- [User-visible or CLI-observable outcome]
- [Example: "crucible conformance l3-adapter rejects generators with invalid supersede lineage" (for C-9 conformance)]

**Invariant signals** (what property tests verify, if applicable):
- [Mathematical or algorithmic property that must hold]
- [Example: "Hash-chain integrity holds across all replay scenarios" (ADR-0011)]

**Countersignals** (what observable failures would indicate violation):
- [What breaks if the decision is not followed]
- [Example: "Router policy bypass allows untrusted proposals to reach Applier"]

---

## Security Implications

[Describe any security, privacy, or trust implications of this decision.]

---

## Resolved Questions

[List any previously open questions that this ADR resolves, with clear answers.]
