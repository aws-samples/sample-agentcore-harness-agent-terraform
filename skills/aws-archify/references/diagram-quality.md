# Diagram quality rules

Rules for making an AWS-icon figure easy to read. `SKILL.md` covers how to render and check a figure;
this file covers what a good one looks like. Apply them while authoring the scene, then confirm them on
the PNG.

## One idea per figure

- A figure answers one question: "how does a request reach the data", "how do the accounts connect".
  If you need a second question, draw a second figure.
- Give it one obvious main path, read left to right or top to bottom. Side branches leave from the
  main-path node they belong to, not from wherever there is room.
- Aim for about 12 main nodes or fewer. Past that, fold detail into a group or split the figure.
- Draw a group only for a real boundary: an account, a VPC, a subnet, a Region, a trust or ownership
  line. A group is not decoration and does not replace an arrow.
- Put actors outside the system boundary (users, a corporate network, an external product) outside
  every group.
- Before adding a routing tweak, remove arrows that add no information. Fewer arrows almost always
  beats cleverer routing.

## Labels

- Use the exact current service name as the caption (Amazon SageMaker AI, not SageMaker; AWS WAF, not
  WAF). Keep commands, API paths and resource names exactly as written.
- An arrow label says what crosses the arrow: the protocol, the action, the direction or the data
  ("HTTPS", "PutObject", "replicates", "events"). One to three words.
- Leave an arrow unlabelled only when its two ends already make it obvious, and then on purpose. A
  label that carries a protocol, an action or a boundary crossing is part of the design: never delete
  it to make space.
- When a label collides, fix it in this order: move the label (`labelAt`), then widen the gap or reroute,
  and only then shorten the wording without losing meaning.
- Use one language and one vocabulary across the figure and the document it sits in. If the prose says
  "ingestion", the arrow does not say "load".
- One title, short. Do not add a subtitle that repeats the title or lists the nodes.

## Spacing and alignment

- Spacing means the clear gap between boxes, not the distance between their centres. Two 160px-wide
  nodes 200px apart leave only 40px for an arrow and its label.
- A label needs a gap wider than itself plus some breathing room. As a rough guide, a 12px label is
  about 6 to 7px per character plus a dozen pixels of halo, so "replicates" needs roughly 80px of clear
  gap.
- Keep one column pitch per row and give each row its own band (see "Rows, holes and alignment" in
  `SKILL.md`).
- Siblings go side by side; a stack of peers reads as a hierarchy.
- Fix defects in this order, re-rendering after each: overlapping nodes, arrows through icons, arrows
  sharing a line or crossing, then label clearance.

## Readability at the size it will be read

- Decide where the figure will appear before drawing it: a document column, a slide, a blog image
  capped at 800px.
- Text scales with the whole figure. A 12px caption in an SVG 1,600px wide becomes about 6px when shown
  800px wide, which is too small. For an 800px slot, keep the figure no wider than about 1,100px, or
  split it.
- Aim for an aspect ratio of 4:3 to 16:9 (about 1.33 to 1.78; `check-layout.ts` warns past 2.5:1). A long
  strip becomes unreadable once it is scaled to the page.
- Check the PNG at the target width, not only at full size.

## Contrast and colour

- Never let colour carry meaning alone. A denied path is red, dashed and labelled "denied"; a reader
  who prints in grey must still get it.
- Keep text dark on a light background. Do not place captions over coloured group fills or icon tiles.
- Use colour sparingly: the icon category colours already do a lot. Reserve an accent for the one thing
  the reader must notice.

## Legends and captions

- Most AWS-icon figures need no legend: the icons and captions name the services. Add one only for a
  convention the icons do not explain (a dashed arrow, a colour). Never a numbered-step legend:
  diagrams do not number their steps; each arrow carries a short label instead.
- A legend lists only what the figure actually uses, in the document's own words.
- The document caption or "what happens" paragraph says what the figure shows and walks the main path
  once. It does not repeat every label.
- Name every icon stand-in, either in the caption or in the hand-over note.

## Before you deliver

- The render, `check-paths.ts` and `check-layout.ts` pass, and the manual arrow checks in
  [geometry-checks.md](geometry-checks.md) are done.
- You have looked at the PNG at the size it will be read, and the main path is obvious within a few
  seconds.
- Every label is spelled right, uses the exact service name and matches the document's vocabulary.
- Every stand-in icon is stated.
- Report only what you actually did. If you did not look at the picture, say so; do not describe a
  check as passed that did not run. Stop after two focused correction rounds that do not improve the
  figure, and report what is still wrong.
