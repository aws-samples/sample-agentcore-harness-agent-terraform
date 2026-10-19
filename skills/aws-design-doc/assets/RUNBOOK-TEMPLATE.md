---
title: <Solution> console demo runbook
kind: runbook
version: <0.1>
status: <Draft | Ready>
owner: <presenting team or role>
audience: <who watches the demo>
classification: <sensitivity label>
date: <YYYY-MM-DD, the day every value below was re-read live>
---

# <Solution> console demo runbook

Companion to the design document. Present the document first, then run this. Everything is clicked
in the AWS console, `<region>` (<Region name>), in <n> accounts. **Every value below was re-read live
on the date above**: re-run the pre-flight before presenting.

| Sign in as | Account | Role in the demo |
| --- | --- | --- |
| `<profile>` | `<account id>` | <the team that owns the solution> |
| `<profile>` | `<account id>` | <the team that uses it> |

## Open <n> tabs

| Tab | Account | Page |
| --- | --- | --- |
| 1 | <account> | <console path> |
| 2 | <account> | <console path> |
| 3 | <account> | <console path> |

## The chain to establish first

Narrate this over tab <n> before clicking anything. Without it the audience watches something happen
and does not know why it matters.

```
<component>  ->  <component>  ->  <component>
                      |  <what crosses this boundary>
              <the user's action>
                      |
              <the result the demo will show>
```

The sentence that lands: **<the one thing the audience should repeat afterwards>.**

## 1. <The strongest beat, so put it first>

Tab <n>. <What the audience sees, and the exact value they should see: `<id or value>`.>

Then tab <n> shows why: <the mechanism behind it, named as the AWS documentation names it>.

> <A console artefact the audience will notice. State the exact sentence to say.>

## 2. <The main user action>

Tab <n>, then **<Button>**. <The inputs, as a list.>

Create it. It comes back with **`<the exact expected value>`**, <why that value and not another>.

Back to tab <n>: <where the result shows up, and what it proves>.

## 3. <What the solution refuses, or how it handles a failure>

Tab <n>, then **<Button>** again, but this time <the input or action that must fail>.

It fails with **<the exact error>**. <Which control produced it, where it is configured, and who
owns it.>

This is the step to spend time on: **<what would happen without this control>.**

## 4. <Any follow-on effect>

<One act, the wait time, and what appears on its own. Keep to a minute.>

## Questions to expect

**"<The obvious challenge>"** <Honest answer, naming the beat that proved it.>

**"<The second challenge>"** <Honest answer.>

**"<The question about a gap>"** <Name the gap plainly: a known property, not a surprise.>

## Pre-flight: re-read before presenting

```bash
export AWS_REGION=<region>

# <what this proves, in the imperative>
AWS_PROFILE=<profile> aws <command> --query '<jmespath>' --output text
```

Expected: <the exact expected output, including the value step 2 will hand back>.

> **<Any console artefact to avoid opening>.** <What it is, why it cannot be cleaned up, and the exact
> sentence to say if someone spots it.>

## Cleanup

- <Delete in dependency order>
- Confirm <the count> is back to **<n>**
