---
name: aws-design-doc
description: Write an AWS design document (HLD, LLD, architecture decision record, solution brief or one-page reference architecture) and ship it as a themed, self-contained HTML page and a matching Word file, with official AWS Architecture Icon diagrams inline. Use when asked to produce, restructure or review an HLD, LLD, ADR, design doc, one-pager, solution brief, reference architecture, cost section or architecture write-up for an AWS solution, to render a markdown design into something shareable with a customer, or to build the console demo runbook that goes with one. Carries the templates, the build and lint commands, the writing rules, the reviewer checklist, and the traps that only show up once. Figures are drawn by aws-archify, which this calls.
license: MIT-0
metadata:
  version: "5.0"
  draws-figures-with: aws-archify
---

# AWS design documents

> `$SKILLS` below is the directory that holds this plugin's skills: `skills/` in this repository, or the parent of this skill's base directory otherwise.

## First use

Run once per machine (installs python-docx for the builders' `python3`, sets up aws-archify for figure
PNGs, skips anything already installed). Word output also needs `pandoc` on the PATH.

```bash
bash $SKILLS/aws-design-doc/setup.sh
```

## The job

Turn a design into a **self-contained themed HTML page** and a **Word file with the same content**,
with official AWS Architecture Icons inline. The documents are simple, practical, ProServe-style:
short sections, tables over prose, one figure per aspect.

1. **Pick the kind** (table below), copy its template, name the audience and the decision asked.
2. **Draft**: fill the template, drop what does not apply. Draw figures with **aws-archify**.
3. **Verify** every AWS claim against the AWS documentation, with a link.
4. **Lint** until 0 errors; fix or justify every warning.
5. **Build** HTML and Word, read the build output, look at the result.
6. **Review** with the checklist below, then the final build with `--strict`.
7. **Deliver** the `.html` and `.docx` from the `--strict` build, plus anything you could not verify.

Figures are not this skill's job: route, draw, render and check each one with `aws-archify`, then
embed it here.

## Which document

Say the kind in the title and in `kind:`. When the ask is vague, name the kind you chose in one line
and write it.

| They ask for | Kind | `kind:` | Template | Title (`# `) |
| --- | --- | --- | --- | --- |
| "HLD", "high-level design", "design doc", "solution design" | High-level design | `hld` | `assets/TEMPLATE.md` | `<Solution> high-level design` |
| "LLD", "low-level design", "detailed design", "build doc" | Low-level design | `lld` | `assets/LLD-TEMPLATE.md` | `<Component> low-level design` |
| "one-pager", "solution brief", "brief for the customer" | Solution brief (one page) | `brief` | `assets/BRIEF-TEMPLATE.md` | `<Solution> solution brief` |
| "reference architecture", "AWS-style one page", "architecture one-pager" | Reference architecture (one page) | `refarch` | `assets/REFARCH-TEMPLATE.md` | `<Solution> reference architecture` |
| "ADR", "decision record", "why did we choose X" | Decision record | `adr` | `assets/ADR-TEMPLATE.md` | `ADR-<n> <decision>` |
| "demo script", "walkthrough", "runbook for the demo" | Demo runbook | `runbook` | `assets/RUNBOOK-TEMPLATE.md` | `<Solution> console demo runbook` |
| "overview", "summary for leadership" (2 pages) | Solution overview | `overview` | HLD, overview profile | `<Solution> solution overview` |
| "security design", "threat model write-up" | Security design | `security` | HLD, security profile | `<Solution> security design` |
| "migration plan", "cutover plan" | Migration plan | `migration` | HLD, migration profile | `<Workload> migration plan` |
| "Well-Architected review", "WAR" | Well-Architected review | `war` | HLD, review profile | `<Workload> Well-Architected review` |
| "operational readiness", "ORR" | Operational readiness review | `orr` | HLD, readiness profile | `<Solution> operational readiness review` |
| "assessment", "discovery findings" | Assessment | `assessment` | HLD, assessment profile | `<Scope> assessment` |

A kind the table does not name (a PR-FAQ, a whitepaper, a bid response) is not a design document: say
so, and offer the nearest kind or a plain markdown document.

### The HLD outline

| Section | Holds | Size |
| --- | --- | --- |
| Document history | Version, Date, Author, Change | One table |
| 1. Introduction | 1.1 Purpose, 1.2 Scope and assumptions, 1.3 Requirements summary (ID, Requirement, Section), 1.4 Key terms | Half a page |
| 2. Architecture | One overview figure and the main components as a short list | One figure |
| 3. How the design works | One numbered subsection per aspect (request path, data flow, network, identity, failure handling), each with its own figure or table | 1 to 3 pages |
| 4. Roles and responsibilities | Team, Owns and operates, Does not own | One table |
| 5. Key architecture decisions | ID, Decision, Rationale, Reversible? (two-way door, and what reversing costs) | One table |
| 6. High-level implementation steps | #, Step, Owner, Where | One table |
| 7. AWS references | The AWS pages each claim was checked against | A list |
| 8. Appendix | A. Do's and don'ts, B. Risks and deviations, C. Assumptions to confirm | Tables |

**Optional sections**, added as numbered sections before "AWS references" only when the audience needs
them: Security, Reliability and DR, Cost, Well-Architected alignment, Operations. The template carries
a two-line guide for each. A decision that needs more than a table row gets its own ADR, linked from
the rationale.

The LLD follows the same spirit: Document history, 1. Introduction (purpose and parent HLD, scope,
deviations), 2. Component design (one subsection per component), 3. Interfaces, 4. Configuration,
5. Deployment steps, 6. Testing, 7. References, 8. Appendix.

### One-page kinds

`brief` and `refarch` are one page: about 450 words at most (the lint warns above that), one figure,
unnumbered sections, and **no numbered steps**: the bullets under "How it works" are keyed to the
figure's arrow labels. In Word they get a compact title block and no cover, contents or document-history page.

- **Solution brief**: The challenge (3 bullets), The solution (2-3 sentences and the figure), How it
  works (4-6 bullets), Benefits (3-4 bullets; a number only with its source), Get started.
- **Reference architecture**, shaped like the AWS reference architecture one-pagers: the title, a
  one-sentence standfirst as the subtitle, one large figure, then How it works, Services used and
  Considerations (3 bullets).

### Profiles: the HLD with a different section set

Keep the HLD sections listed, renumber them `1..n` in order, and add the named ones in place.

| Kind | Keep from the HLD | Add | Drop |
| --- | --- | --- | --- |
| Solution overview | 1 (purpose and scope only), 2, 5, 7 | Cost summary table, if asked | 3, 4, 6, 8; 2 pages at most |
| Security design | 1, 2, 3 (identity, network, data flow), 4, 5, 7, 8 | Security in full (classification, identity, encryption, network boundary, logging, threat model, shared responsibility); "Attack surface and trust boundaries" as an aspect in 3 | 6 |
| Migration plan | 1, 2 (target design), 4, 5, 6 in full, 7, 8 | "Current state and inventory" before 2; "Wave plan" and "Cutover and rollback" inside 6; Reliability and DR | 3 |
| Well-Architected review | 1, 2 (what was reviewed), 7, 8 | Well-Architected alignment in full; "Findings by pillar" with severity and owner; "Remediation plan" with dates | 3, 4, 5, 6 |
| Operational readiness review | 1, 4, 7, 8 | Reliability and DR, Operations in full; "Readiness checklist" (pass, fail or waived, owner); "Launch decision" | 2, 3, 5, 6 |
| Assessment | 1, 2 (current state), 7, 8 | "What we looked at and how"; "Findings" with severity, evidence and owner; "Recommendations" ranked with effort | 3, 4, 5, 6 |

### HLD or LLD

| | HLD | LLD |
| --- | --- | --- |
| Answers | What are we building and why | How exactly it is built |
| Audience | Decision makers, architects, security and operations reviewers | The engineers who build and operate it |
| Depth | Components, flows, decisions, responsibilities | Settings, interfaces, CIDRs and rules, IAM policies, IaC layout, tests |
| Done when | A reviewer can approve or reject the approach | Another engineer can build it without the author |
| Length | 6 to 10 pages | As the configuration needs; split per component past 20 pages |

An LLD links its parent HLD and version in 1.1 and never contradicts it; an architecture change goes
into the HLD first. Wrong altitude is the most common finding both ways: config dumps in an HLD, boxes
without contracts in an LLD.

## Headings

- **Exactly one `#` heading**, the first line after the front matter, matching `title:` word for word.
- **Sentence case**: "How the design works", not "How The Design Works". Proper nouns keep capitals.
- **Number the main sections** of an HLD, LLD or profile: `## 1. Introduction`, then `### 1.2 Scope and
  assumptions`. The builders draw the number as a badge. ADRs, runbooks and one-page kinds are not numbered.
- **The appendix is `## 8. Appendix`** (the last number) with `### A. <name>` subsections.
- **Stop at `###`** in an HLD; an LLD may use `####` inside one component.
- **One figure per section or subsection**, right under its heading, with a caption. Two figures in
  one subsection means it holds two ideas.
- Word's contents lists `##` and `###` (Heading 1 and 2 in Word).

## Front matter and document history

```yaml
---
title: Retrieval assistant high-level design
subtitle: An internal assistant that answers from approved documents
kind: hld
version: 1.2
status: In review
owner: Platform architecture team
prepared_by: AWS Professional Services
prepared_for: AnyCompany
audience: Solution architects and security reviewers
classification: Confidential
date: 2026-09-30
---
```

All keys are optional. The block starts on line 1 with `---`; each line is `key: value`, `key: [a, b]`,
or `key:` followed by `- item` lines.

- `kind` selects the lint rules (title wording, required sections, figure, one-page budget); it is not
  displayed.
- `subtitle` is one line under the title on the Word cover. The standfirst (first paragraph after the
  `#` title) is still the one-sentence summary; in a `refarch` the standfirst is the subtitle.
- `prepared_by` (default "AWS Professional Services") and `prepared_for` (the customer or team,
  optional) fill the "Prepared by / Prepared for" table on the Word cover.
- `reviewers` is still accepted (the ADR template uses it).
- `title` feeds the HTML `<title>`, the Word footer and the Word title property; `owner` is the Word
  author. Name roles and teams, not people.

**Word layout** (built by `build-docx.py`): a cover page (title, subtitle, Prepared by/for table), a
Document history page, a Contents page, then the body.

- `## Document history` is its own section. Its **first table** becomes the history page; any other
  text in the section keeps the heading in the body too, so keep it to the table.
- In Word, `##` headings become Heading 1 and `###` Heading 2, so the template's `##` sections are the
  top level and the Contents page lists `##` and `###`.
- One-page kinds (`brief`, `refarch`) get a compact title block (title, subtitle, one metadata line,
  the standfirst) instead of the cover, history and contents pages.
- An older document with `## Document control` still builds as before, without a history page.

**The "no temporal framing" rule is about the body.** Version dates and the history table are
metadata. Banned in the text: "currently", "as at 16 September", "measured today". A cost estimate date
is required (see Cost sections).

## Learn the service's own vocabulary first

Read the service's "how it works" and task pages and use AWS's nouns and order. Example, Amazon VPC IP
Address Manager: create the IPAM, then a **scope**, then pools, share with AWS RAM, then an
**allocation**. "Scope" and "allocation" are checkable against the docs; invented words are not. Read
docs as Markdown: swap `.html` for `.md`; find current slugs in the guide's `llms.txt`.

## Writing rules

- **Official AWS service names in full**, first use and in every figure label. No code identifiers or
  file paths in HLD prose.
- **Data over adjectives.** "Fast", "large", "highly available" become a number with a unit, or go.
- **No guarantees or superlatives**: not "ensures", "guarantees", "best", "seamless". Write "is designed
  to" and state the mechanism.
- **Short, active sentences**, 25 words or fewer; the recommendation stated assertively.
- **Never present an assumption as settled.** Describe the structure; list the assumption in
  Appendix C.
- **No test numbers from your own proof of concept.** If a figure helps, label it a model with its
  assumptions.
- **Anonymise.** No customer names, real account IDs, domains or people. Use `111122223333`,
  `example.com`, `AnyCompany`; name teams and roles.
- **Define every acronym** on first use or in Key terms.
- **One fact, one place.** Refer to figures by number ("Figure 2 shows ...").
- **No em or en dashes**; use a colon, a comma, brackets or two sentences.
- No "see OTHER-DOC.md" in plain text; a markdown link to a sibling document that ships with it is fine.
- A requirement is an imposed fact, an assumption an unconfirmed belief, a risk is remediated: keep
  them in their own tables.

## Cost sections

When a Cost section is added:

1. **Read the rate from the Price List API**, not a pricing page or memory. Find the usage type, then
   the SKU; the service code is often not the obvious one (IPAM bills under `AmazonVPC`).

   ```bash
   aws pricing get-attribute-values --region us-east-1 --service-code <ServiceCode> --attribute-name usagetype
   aws pricing get-products --region us-east-1 --service-code <ServiceCode> \
     --filters Type=TERM_MATCH,Field=usagetype,Value=<exact-usage-type>
   ```

   The AWS Pricing MCP tools `get_pricing_attribute_values` and `get_pricing` do the same.
2. **Say whether the rate tiers** (`beginRange` / `endRange`; one band `0` to `Inf` means no discount).
3. **A scale table** across orders of magnitude (1, 10, 100, 1,000), and **a workload scenario** from
   stated assumptions.
4. **State what is not charged**, and put any exclusion before the first number.
5. **Date and place every number**: estimate date, Region, pricing model.
6. **Link the Pricing Calculator estimate and keep the numbers in the document**: shared links are
   public and stay valid for one year when created on or after 31 May 2023
   ([save and share](https://docs.aws.amazon.com/pricing-calculator/latest/userguide/save-share-estimate.html)).

## Verify before sharing

- **Every AWS fact through `aws-docs-lookup`**, read in this session as Markdown.
- **Every quota, limit, price or IAM claim carries an inline link** to the specific page (quotas page,
  Service Authorization Reference `list_<prefix>`, the feature page), and the same page is in AWS
  references as `[title](url) - the claim it supports`. Link the `.html` page; check each returns 200.
- **Arithmetic is a claim**: compute nesting, overlaps and subnet counts in a script.
- **An empty API result is not proof of absence**: a wrong field name returns zero rows and no error.

## Lint

```bash
python3 $SKILLS/aws-design-doc/scripts/lint-doc.py MY-DOC.md            # findings with line numbers
python3 $SKILLS/aws-design-doc/scripts/lint-doc.py MY-DOC.md --ascii    # any non-ASCII is an error
python3 $SKILLS/aws-design-doc/scripts/lint-doc.py MY-DOC.md --strict   # exit 1 on warnings too
```

Both builders run it first. Each finding is `NAME.md:LINE: level: message`; word lists, limits and
each kind's required sections live in `scripts/lint-rules.json`.

- **Error**: an unfilled `<...>` slot, a leftover `<!-- Figure:` note, a TODO/TBD with no owner, a
  missing link or figure file, a dead `#anchor`, a duplicate heading id, a real-looking account ID.
- **Warning**: unknown `kind:`, a title that does not name its kind, a missing or out-of-order section
  for the kind (`Document control` is accepted for `Document history`), a Document history with no
  table, no figure in an hld, lld, brief, refarch or figure-bearing profile, a one-page kind over 450
  words or with a numbered list, dashes and non-ASCII, dated phrases, weasel and guarantee words,
  sentences over 40 words, undefined acronyms, an unsourced quota/limit/price number, unexplained
  second Regions or overlapping CIDRs.
- **Info**: words that are often correct ("only", "supports"), comparatives with no number near.

A copied template reports an error for every slot until it is filled; that is the point. Write a TODO
as `TBD (owner: platform team)`, or better, put it in Appendix C. The lint is a floor, not the review.

## Build

```bash
python3 $SKILLS/aws-design-doc/scripts/build-html.py MY-DOC.md [--strict]   # themed, self-contained page
python3 $SKILLS/aws-design-doc/scripts/build-docx.py MY-DOC.md [--strict]   # Word, same content
```

Both lint first and write beside the source with a lower-cased stem. `--strict` fails on a lint error,
a mermaid fence with no renderer, or an unresolved link; **the final build of anything handed over
uses `--strict`**.

Figures are aws-archify SVGs, referenced by a comment on a line of its own, path relative to the
markdown, optional caption after `|`:

```markdown
<!-- aws-svg: diagrams/ingestion.svg | Ingestion path from upload to vector index -->
```

Captioned figures are numbered "Figure 1.", "Figure 2." in both outputs; the caption is also the Word
alt text. No other marker is supported; an old `<!-- archify: -->` marker stops the build.

**Read the build output, not just the exit code.** `build-html.py` reports figures, unresolved links
and external references (must be 0); `build-docx.py` fails if fewer images than markers reached the
file. A rewritten section can take its marker with it, and the count is the only signal.

### Markdown the builders take

- Front matter; headings `#` to `######` (first `#` is the title, `##` make the contents); `---` rules;
  `-`/`*`/`+` bullets and `1.` lists; tables, fenced code, `>` quotes, `**bold**`, `*italic*`, `` `code` ``.
- The first paragraph after the title becomes the standfirst in both outputs.
- `https://` and `mailto:` links pass through. A relative `other.md` link becomes `other.html` only if
  that page was built first (build ADRs and LLDs before the HLD). `#anchor` links are checked.
- A paragraph opening with bold text is a callout in HTML (Note, Warning, Risk, Decision colour it);
  Word shows a plain bold lead-in, so never rely on the colour for meaning.
- HTML comments that are not figure markers are authoring notes, dropped from both outputs.
- A table cell that is exactly one status word (Accepted, Open, High, Low, Draft ...) is a coloured
  pill in HTML.

### What the builders need

- `build-docx.py`: `pandoc` on the PATH, python-docx in `vendor/python` (from `setup.sh`), and
  Node.js 22.18+ with aws-archify's packages to rasterise each SVG at 3x through
  `$SKILLS/aws-archify/scripts/svg-to-png.ts`.
- `build-html.py`: nothing for AWS-icon figures. Mermaid fences need `mmdc`; without it they show as
  code (a failure with `--strict`). An aws-svg marker right after a mermaid fence replaces it.

## Look at it

Look at every figure through a copy that fits inside 1568 x 1568 px: the `$TMPDIR/<name>.look.png`
its render printed, or one you export with
`node $SKILLS/aws-archify/scripts/svg-to-png.ts fig.svg "${TMPDIR:-/tmp}/fig.look.png" --look`. Never
Read the 4800 px PNG or a PNG exported at a fixed width: a tall or wide figure then goes over 2000 px
on a side and the model API refuses it. Open the HTML in a browser if one is available. The HTML
must report `0 external refs`; `<a href>` links are navigation and do not count. Open the Word file and check the cover, the document history and the
contents pages (Word asks to update fields on open; Yes fills the contents).

## Reviewer checklist

Run it as a separate read against the built HTML, after the lint is clean. Tick every box or fix the
document; report any box left open. `references-review.md` explains the editorial items and holds the
reviewer pass prompts.

**Structure**

- [ ] Front matter has kind, version, status, owner, classification and date; Document history is filled.
- [ ] 1.1 Purpose states the problem, the recommendation and the decision asked, in 3 sentences or fewer.
- [ ] Out of scope would let a reader turn down a scope-creep request by pointing at it.
- [ ] Altitude matches the label; the HLD body is 10 pages or fewer; a one-pager fits one page.
- [ ] Optional sections appear only where the audience needs them; no empty or "not applicable" sections.

**Design and decisions**

- [ ] Every requirement has an id and a section; every non-functional one has a number and a unit.
- [ ] Each aspect in section 3 has its own figure or table, not a copy of Figure 1.
- [ ] Each decision names the option it was chosen over and says whether it is reversible and at what cost.
- [ ] The roles table says who owns, operates and does not own each part.
- [ ] Implementation steps have an owner and a place.

**Accuracy**

- [ ] Every figure has a caption, is referred to by number, and uses the prose's names and flow.
- [ ] Merge test: no figure whose nodes all appear in another figure.
- [ ] Official AWS service names in full on first use and in every figure.
- [ ] Every quota, limit, price and IAM claim has an inline link, and the page says it.
- [ ] Names, Regions, account roles and CIDRs are the same in every section.
- [ ] No unsourced number; model figures are labelled with their assumptions.

**Risk and language**

- [ ] Risks have a cause, impact and remediation; assumptions name who confirms them.
- [ ] No weasel words, guarantees or superlatives; acronyms defined.
- [ ] No customer names, real account IDs, domains, people, internal tool names or test measurements.
- [ ] No point stated three times; counts match ("three tiers" above three rows); cross-references
  renumbered after any move; clean deletes (no commented-out blocks, stub headings, single-item lists).

### Optional reviewer pass

For a document going to a customer or a formal review, run three reviewers in parallel as subagents,
each with a fresh context, the built HTML or markdown, and one lens: **architecture**, **security**,
**customer readability**. Each finding quotes the text, names the section, and is Critical (blocks
delivery), Major (a reviewer would return it) or Minor. No praise, no invented findings. Fix every
Critical and Major, then re-lint and rebuild. The prompts are in `references-review.md`.

## The companion runbook

A design earns a **console demo runbook** as a separate artifact (`assets/RUNBOOK-TEMPLATE.md`), under
a thousand words: accounts table, tabs to open, the chain to narrate first, beats with exact click
paths and expected values, questions to expect, pre-flight commands, cleanup.

- **Re-read every id live and date the runbook**; rebuilds reissue ids.
- **State the expected value**, not just the command, and compute it in advance.
- **Warn about console artefacts** the audience will see, with the sentence to say.
- **Lead with the strongest beat**, and give the refusal (the control working) its own beat.

## Builder traps (for whoever edits the builders)

- `Table Grid` does not exist in pandoc's output: apply borders as explicit `w:tblBorders` XML.
- `w:pPr` children have a fixed schema order; appending puts them last, which Word can drop.
- `RGBColor.from_string` takes a hex string. Use a font on every platform (`Segoe UI` is Windows-only).
- The standfirst comes from `split_lead` in `build-html.py` for both outputs.
- Bare `<placeholder>` text is escaped before pandoc, which would read it as an HTML tag and drop it.
- Mermaid through puppeteer needs `--no-sandbox` inside an already-sandboxed shell.

## Worked example

Read `examples/sample-design-doc/` at the plugin root first (markdown, built HTML and Word): front
matter, section rhythm, figure captions and reference style are easier to copy than to infer.
