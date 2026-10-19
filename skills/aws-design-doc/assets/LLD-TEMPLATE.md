---
title: <Component or solution> low-level design
subtitle: <One line for the cover, under the title: what this document specifies>
kind: lld
version: <0.1>
status: <Draft | In review | Approved>
owner: <owning team or role>
prepared_by: AWS Professional Services
prepared_for: <customer or team; delete this line if the document is internal>
audience: <the engineers who build and operate it>
classification: <sensitivity label>
date: <YYYY-MM-DD>
---

# <Component or solution> low-level design

<One sentence: which part of the design this document specifies, and for whom. This becomes the
standfirst.>

## Document history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| <0.1> | <YYYY-MM-DD> | <team or role> | <First draft for review> |

## 1. Introduction

### 1.1 Purpose and parent design

<What this document specifies, and the parent: [<Solution> high-level design](<parent-hld>.md),
version <n>. Build the HLD first so the link resolves, or link its published URL. This document never
contradicts the HLD; an architecture change goes into the HLD first.>

### 1.2 Scope

<The components covered, the HLD requirement ids they implement, and what is out of scope.>

### 1.3 Deviations from the HLD

<Each deviation, its reason and the HLD version that already carries it, or "None".>

## 2. Component design

<One subsection per component. A data store's block carries its key schema, access patterns and
retention; a compute block its sizing, timeouts and concurrency.>

### 2.1 <Component>

**Responsibility.** <What it does, and the requirement ids it serves.>

| Setting | Value | Why |
| --- | --- | --- |
| <instance class, capacity mode, memory, timeout, retention> | <value> | <requirement id or [AWS page](https://docs.aws.amazon.com/<guide>/latest/<page>.html)> |

<!-- Figure: draw the component's flow, including the error path, with aws-archify, then replace this comment with an aws-svg marker line that has a caption. -->

**What happens.** <The flow, including what happens when a call fails.>

## 3. Interfaces

| Interface | Type | Caller | Request and response | Limits |
| --- | --- | --- | --- | --- |
| <API, event or queue> | <REST / event / stream> | <who calls it> | <schema link or summary> | <throttling, payload size, timeout, linked to the quota page> |

<How a contract changes without breaking its callers.>

## 4. Configuration

### 4.1 Network

| Account role | VPC | CIDR | Subnets | Purpose |
| --- | --- | --- | --- | --- |
| <workload account> | <vpc> | <10.0.0.0/16> | <per AZ, computed by script> | |

| Rule set | Direction | Source | Destination | Port and protocol | Why |
| --- | --- | --- | --- | --- | --- |
| <security group, network access control list or firewall rule group> | <Inbound / Outbound> | | | | <requirement id> |

### 4.2 Identity and access

| Principal | Trusted by | Permissions | Boundary or guardrail |
| --- | --- | --- | --- |
| <role> | <service or account that assumes it> | <actions and resources, least privilege> | <permissions boundary, SCP, key policy> |

<Policy documents that matter, one fenced code block each, with `111122223333` as the account.>

### 4.3 Encryption, secrets and logging

| Item | Setting | Owner |
| --- | --- | --- |
| <key, secret or log destination> | <key policy, rotation, retention> | <team> |

### 4.4 Parameters per environment

| Parameter | Environment | Value |
| --- | --- | --- |
| <name> | <dev / test / prod> | <value> |

## 5. Deployment steps

<The infrastructure as code layout in one sentence: repositories, modules or stacks, and what each owns.>

| # | Step | Command or pipeline stage | Check | Rollback |
| --- | --- | --- | --- | --- |
| 1 | <Deploy the network stack> | <command or stage> | <what proves it worked> | <how to undo it> |

## 6. Testing

| Requirement | Test | Type | Pass condition |
| --- | --- | --- | --- |
| <R1 or NFR1 from the HLD> | <test name> | <unit / integration / load / failure injection> | <measurable condition> |

## 7. References

- [<Page title>](https://docs.aws.amazon.com/<guide>/latest/<page>.html) - <the claim it supports>

## 8. Appendix

### A. Failure modes and alarms

| Failure | Alarm and threshold | Automated action | Manual action |
| --- | --- | --- | --- |
| <dependency timeout, quota exceeded, bad input> | <alarm name, value and period> | | |

### B. Risks and open questions

| Risk or question | Impact | Remediation or answer | Owner |
| --- | --- | --- | --- |
| <what can go wrong, or what is not yet decided> | <Low / Medium / High> | | <team, and the date it is needed by> |
