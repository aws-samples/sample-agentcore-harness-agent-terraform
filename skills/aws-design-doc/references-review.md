# Reviewing a design document

Read this with the reviewer checklist in `SKILL.md`. It explains the editorial items with the defects
they came from, and gives the prompts for the optional parallel reviewer pass.

## Editorial items, with examples

Do this as a separate read, after the document is accurate and the lint is clean.

**The merge test for diagrams.** List the nodes of each figure. If every node of figure B already appears
in figure A, B is redundant: **delete the picture and keep its prose**. Two diagrams showing the same
chain make a reader hunt for the difference. Prose that a picture cannot carry (an API error message, a
policy scope, a documented limitation) is exactly what survives the merge. Renumber the "Figure N"
references in the prose afterwards.

**Hunt the same point stated three times.** A claim in the lead-in, again as a bullet, and again in a
later subsection reads as padding. Search for the *idea*, not the words: "the plan records rather than
refuses", "it does not prevent anything on its own" and "the refusal comes from the guardrail" are one
fact in three costumes.

**Cut the summary that restates the paragraphs above it.** "Between them: X and Y" directly under a bold
X paragraph and a bold Y paragraph earns nothing.

**Count your own counts.** "Two properties" above three bullets. "Three tiers" above four rows.

**A subsection heading must not repeat its parent's wording.** Parent "Drawing a range, and what stops a
hand-picked one" over child "What stops a hand-picked range" is a navigation dead end.

**Renumber cross-references whenever a section moves.** Enumerate them first (`grep -noE '[Ss]ection [0-9]|Figure [0-9]'`),
then fix each; a reference that survives into the wrong section is worse than none. A reference that
becomes internal after a merge should become prose ("the size limits above").

**Delete cleanly.** No commented-out blocks, no "removed X" notes, no stub headings.

**Structural defects** to look for in the same pass: a numbered list with a single `1.` and no sibling, a
missing blank line running a paragraph into a list item, and a table whose lead-in sentence promises a
different number of columns than it has.

**Cross-section consistency.** List every Region, account role, CIDR and service name the document uses
and check each is spelled and valued the same everywhere. The lint catches Region and CIDR drift; account
roles and service names need a human read.

**Alternatives that are real.** Each key decision's rationale names the option it was chosen over. An
option a reviewer would dismiss in one sentence is a strawman: name the genuine alternative at the same
altitude instead.

**Anticipated questions.** Write down the 3 to 5 questions the reader will ask first. Each one either
already has an answer in the body, or becomes an assumption to confirm, with the team that confirms it
(HLD Appendix C).

## Parallel reviewer pass

Run the three lenses below as separate subagents, in parallel, each with a fresh context. Give each the
path to the built HTML (or the markdown if the build is not ready), the document's audience from the
front matter, and one prompt. Do not pass the drafting conversation: a reviewer who knows what the
author meant cannot see what the page fails to say.

Shared rules, included in every prompt:

```text
You are reviewing an AWS design document. Report findings only.
- Each finding: severity, section number, the exact quoted text, what is wrong, the fix.
- Severity: Critical = wrong, unsafe or unverifiable, blocks delivery. Major = a reviewer would
  reject or return the document for it. Minor = polish.
- No praise, no summary of strengths, no hedging. If the lens has no findings, say "No findings".
- Do not invent a finding to fill the list. Do not restate the document.
- Where you doubt an AWS fact, say which page would settle it; do not assert the fact yourself.
End with a decision: Approve, Approve with changes, or Return, and one sentence why.
```

**Lens 1: architecture and Well-Architected.**

```text
Lens: architecture. Check the altitude matches the kind in the front matter; that each key decision
names the genuine alternative it was chosen over and says whether it is reversible; that failure
modes have detection and recovery; where the design breaks at scale and which quotas bind; that a
Well-Architected section, if present, addresses all six pillars; that cost figures carry a source,
date and Region; that every figure matches the prose.
```

**Lens 2: security.**

```text
Lens: security. Check data classification, the identity and access model (who assumes what, least
privilege), encryption at rest and in transit with key ownership, the network boundary and every path
across it, logging and audit destinations and retention, the threat model summary (top threats per
STRIDE category that applies, mitigation, owner under the shared responsibility model), and anything
a formal security review would stop on. Flag real account IDs, domains, names or secrets.
```

**Lens 3: customer readability.**

```text
Lens: a reader from the audience in the front matter who has not seen this work before. Check that
the purpose (1.1) alone tells them the problem, the recommendation and the decision asked; flag
every undefined acronym or internal term, every buried recommendation, weasel word, guarantee or
superlative, sentence over 25 words, figure referred to without a number, and table without a
lead-in. List the 3 to 5 questions this reader will ask that the document does not answer.
```

Merge the three reports into one table (severity, section, quote, fix), drop duplicates, fix every
Critical and Major, re-run the lint and the build, and report any Minor left open.
