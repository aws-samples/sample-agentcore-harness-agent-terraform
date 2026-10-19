---
title: <Solution> high-level design
subtitle: <One line for the cover, under the title: what the solution does>
kind: hld
version: <0.1>
status: <Draft | In review | Approved>
owner: <owning team or role>
prepared_by: AWS Professional Services
prepared_for: <customer or team; delete this line if the document is internal>
audience: <who reads this and what they decide>
classification: <sensitivity label>
date: <YYYY-MM-DD>
---

# <Solution> high-level design

<One sentence: what the solution gives its users, and who owns it. This becomes the standfirst.>

## Document history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| <0.1> | <YYYY-MM-DD> | <team or role> | <First draft for review> |

## 1. Introduction

### 1.1 Purpose

<Two or three sentences: the problem, the design this document recommends, and the decision asked of
the reader. A reader who stops here knows what to approve.>

### 1.2 Scope and assumptions

**In scope.** <What this design covers.>

**Out of scope.** <What a reader looks for here but is excluded, each with where it is handled.>

**Assumptions.** <The beliefs the design rests on that nobody has confirmed yet; list them in Appendix C.>

### 1.3 Requirements summary

<One row per requirement. A non-functional requirement carries a number and a unit.>

| ID | Requirement | Section |
| --- | --- | --- |
| R1 | <what the solution must do> | <3.1> |
| NFR1 | <availability, latency, recovery or cost target, with its unit> | <3.5> |

### 1.4 Key terms

| Term | Meaning |
| --- | --- |
| <Acronym or term> | <expansion, and what it means here> |

## 2. Architecture

<One sentence naming the figure: "Figure 1 shows ...". The figure holds the whole solution at one
altitude; detail goes in section 3.>

<!-- Figure: draw the overview with aws-archify, then replace this comment with an aws-svg marker line that has a caption. -->

The main components:

- **<Component>** (<official AWS service name>): <why it exists, in one line>
- **<Component>** (<official AWS service name>): <why it exists>

## 3. How the design works

<One subsection per aspect a reviewer must understand. Each has its own figure or table, never a copy
of Figure 1, and plain prose in the words the AWS documentation uses. Drop aspects that do not apply.>

### 3.1 <Request path>

<!-- Figure: draw the request path with aws-archify, then replace this comment with an aws-svg marker line that has a caption. -->

<What happens, from the user's action to the response, including what happens when a call fails.>

### 3.2 <Data flow>

<Where data enters, where it is stored, how long it is kept, and who can read it.>

### 3.3 <Network>

| From | To | Path | Control |
| --- | --- | --- | --- |
| <source> | <destination> | <VPC endpoint, transit gateway, internet> | <security group, firewall rule, policy> |

### 3.4 <Identity and access>

| Principal | Authenticates with | Can do |
| --- | --- | --- |
| <user, role or service> | <identity source> | <the actions it needs, nothing more> |

### 3.5 <Failure handling>

| Failure | Detection | Response |
| --- | --- | --- |
| <component or dependency fails> | <alarm or signal> | <what happens automatically, and what a person does> |

## 4. Roles and responsibilities

<Who owns and operates each part after hand-off, and the boundary each team must not cross.>

| Team | Owns and operates | Does not own |
| --- | --- | --- |
| <owning team> | <components> | <what sits with another team> |
| <consuming team> | | |

## 5. Key architecture decisions

<One row per decision a reviewer is likely to challenge. Name the option it was chosen over in the rationale.
Reversible is the two-way door test: say what reversing it costs. A decision that needs more than a
row gets its own record (ADR template), linked from the rationale.>

| ID | Decision | Rationale | Reversible? |
| --- | --- | --- | --- |
| D1 | <The design uses X for Y> | <why, over which option, with the requirement id> | <Yes: a configuration change / No: a data migration> |

## 6. High-level implementation steps

<The build order at the altitude of a project plan. Commands and settings belong in the LLD.>

| # | Step | Owner | Where |
| --- | --- | --- | --- |
| 1 | <Create the network> | <team> | <account role, Region or pipeline> |
| 2 | | | |

<!--
Optional sections. Add any of these as numbered sections before "AWS references", only when the
audience needs them, and renumber the sections after them.

- Security: data classification, identity, encryption at rest and in transit with the key owner,
  network boundary and logging; the top threats (STRIDE) with mitigation and owner.
- Reliability and DR: failure modes beyond section 3, the quotas that bind (each linked), RTO and RPO,
  and the disaster recovery strategy that meets them.
- Cost: the rate from the Price List with estimate date, Region and pricing model; a scale table and
  a workload scenario; what is not charged (SKILL.md, Cost sections).
- Well-Architected alignment: one row per pillar, six rows, how the design meets it and the
  requirement ids.
- Operations: monitoring and alarms, backup, deployment and rollback, runbooks, and who operates it
  after hand-off.
-->

## 7. AWS references

The AWS documentation each mechanism, quota and price was checked against.

- [<Page title>](https://docs.aws.amazon.com/<guide>/latest/<page>.html) - <the claim it supports>

## 8. Appendix

### A. Do's and don'ts

| Do | Don't |
| --- | --- |
| <the practice that keeps the design working> | <the shortcut that breaks it> |

### B. Risks and deviations

<A deviation from AWS guidance or from the customer's own standard is a risk: name it here.>

| Risk | Cause | Impact | Remediation |
| --- | --- | --- | --- |
| <what can go wrong> | <the condition that triggers it> | <Low / Medium / High, and what breaks> | <what reduces it, and who owns that> |

### C. Assumptions to confirm

| Assumption | Confirm with | Impact if false |
| --- | --- | --- |
| <unconfirmed belief from 1.2> | <team or role, and by when> | <which section changes> |
