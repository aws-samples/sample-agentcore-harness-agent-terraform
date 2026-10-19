# Review and fix

The final gate for every figure, then what to do when the look finds a defect. Reviewing comes first; the fix workflow
is the second half of this page. The headless edit CLI used for fixing is documented in [edit-mode.md](edit-mode.md).

## Look at every figure

<STRICT_REQUIREMENT>
**You MUST validate every diagram VISUALLY before calling it done; reading the SVG source or the layout report is
NOT enough.** The SVG is the deliverable and the PNG you look at is scratch. Every automated check can pass while the
picture is broken: an arrow through a node, a route that makes no sense, a label on a group title, content off the
canvas. Those only show when you render and look. A figure nobody has looked at is UNVERIFIED and NOT done.

**How to look.** Render, then Read the look copy:

```bash
npm run render -- scenes/<name>.tsx                              # prints the look copy: $TMPDIR/<name>.look.png
node scripts/svg-to-png.ts scenes/<name>.svg /tmp/<name>.png --look   # or export one yourself
```

`--look` fits the PNG inside 1568 x 1568 px whatever the figure's shape. Read only that file: never the 4800 px
deliverable PNG and never a PNG exported at a fixed width. Once a conversation holds several images the model API
rejects any image over 2000 px on a side, and because the rejected image stays in the history, every later turn fails
too.

Optional: with agent-browser installed (`npm i -g agent-browser && agent-browser install`, which downloads Chrome over
the network), `npm run render -- scenes/<name>.tsx --view` screenshots the SVG in headless Chrome to a printed temp
path that you then Read. The warm `aws-diagram-render` session keeps that loop fast;
`agent-browser close --session aws-diagram-render` stops it.

**On every look, confirm each of these, and fix any that fails:**

- **No arrow overlaps or passes through a node, an icon or a caption.** Trace every connector from end to end; one
  that clips a node is a defect.
- **Every route makes sense.** Arrows leave and enter at icon edge centres with a gap, take the clear lane, and neither
  wander nor cross other connectors ambiguously.
- **No arrow runs through a skipped node in a stack.** Joining two non-neighbours of a `<VStack>` or `<HStack>` through
  the along-axis faces runs straight through the icons between them. Switch to the off-axis faces ([arrows.md](arrows.md),
  "Two nodes in one stack that are not neighbours").
- **No arrow leaves through an adjacent neighbour.** An arrow out of a face with a tile right beside it runs into that
  tile before it turns. Leave from a clear face, often the row's outer edge, or route through an `<Anchor>`
  ([arrows.md](arrows.md), "Leave and enter through open space").
- **No arrow cuts through another stack's members or another group.** A single connector between different columns,
  or from a column node to a row below the columns, crosses everything at icon height. Route it over the top or under
  the bottom through an anchor outside the groups; a target in a row below takes the bottom anchor
  ([arrows.md](arrows.md), "Across stacks or groups").
- **No arrow cuts through a group it does not belong to.** For example a return path from a backend tier slicing through
  the public subnet and the private subnet's edge. The report cannot see it (groups are not in its overlap test).
  Decision rule: when an arrow passes through a group, its horizontal faces are usually the wrong ones; make it leave
  and enter through `top` or `bottom` so it travels in the margin above or below the groups. Which combination is best
  is rarely obvious, so batch them (see Parallel candidate fixes below).
- **No elbow riser runs along a group border.** A turning segment on a box edge hides under the border stroke and
  reads as a broken box. The engine moves a default riser that lands exactly on a parallel border by one or two cells,
  but an explicit `riser`, or one a few pixels off the line, still can; the report does not see it. Move the turn with a
  riser sweep.
- **No numbered steps.** The flow is carried by arrow labels; a scene with `<StepBadge>` or `<Diagram steps>` does not
  render ([arrows.md](arrows.md)).
- **No arrow label on a group border.** `check-layout.ts` flags a halo'd label on a border. Re-anchor it with `labelAt`
  or pad the group ([arrows.md](arrows.md), "Keep labels readable").
- **No arrow label touches an icon or another label.** Only a look catches a label on an icon. Trace every italic
  label: it sits in clear space beside its line and clips neither end's icon. When one does: shorten it to one word
  (`sign`, not `submit tx`); if a short line still does not fit the gap, break it over lines (`{"read /\nwrite"}`); if
  neither fits, batch candidates that move it (`labelAt` start, middle, end with `labelSide` top, bottom, left, right)
  and keep the one that reads cleanest.
- **No two labels or boxes overlap, every container fully encloses its children, and nothing is clipped at the canvas
  edge.**

**When a look finds a defect, fix it with parallel candidates.** Do not fix, render and look one guess at a time. Use
the edit CLI (`npm run edit-cli`, immutable by default) to emit two to four candidate fixes to separate files at once,
render them in one batch, discard the ones whose report still shows issues without looking at them, look only at the
clean ones, and keep the winner (below). This is the required way to resolve overlaps, crossings and label collisions.
</STRICT_REQUIREMENT>

Then check the invariants of a finished figure in the rendered view:

- **It has arrows.** Connectors are the flow; the report prints the count. No arrows on a flow request means not done.
- Every connector is a full, continuous line with a visible arrowhead, not a stub cut off by a label.
- Every arrow points the right way and joins the right pair: trace each step.
- Every endpoint sits at an icon edge centre with a gap (id-attached arrows do this for you).
- Nodes that line up are joined by straight lines, not needless bends.

And judge it the way a designer would. It is compact and landscape at a standard ratio, with gaps no larger than
legibility needs ([composition.md](composition.md), "Compact and even"). It is grid-aligned: `misaligned` is empty and
components read as rows, columns or clean grids. Containers frame their contents with small, even margins, peers are the
same size and aligned, and whitespace is uniform. If anything is off, change the structure or the props and render
again.

### What the automated checks see

| Check | Sees | Blind to |
|---|---|---|
| The renderer's `CHECKPOINT` (the layout report, [scene-api.md](scene-api.md)) | Icon against icon (8 px padded), text against text on one line, clipping, alignment inside a group | Every arrow, and text against icons |
| `node scripts/check-paths.ts <svg>` | Horizontal and vertical connector segments against icon tiles 48 px and up; an arrowhead on a zero-length end segment, which browsers draw sideways | All text, group borders |
| `node scripts/check-layout.ts <svg>` | Nodes, groups, rows, gaps, arrows against arrows and text (the rule list is in the skill's `SKILL.md`) | Whether the picture is right |

`npm run render` runs both scripts on every render and exits 3 when either fails. The checkpoint passes a connector
routed straight through a service tile, because the engine routes to a node's centre line and then exits sideways,
which is exactly what two vertically aligned nodes in stacked lanes produce. On two diagrams the renderer had already
passed, `check-paths.ts` found 4 and 8 intersections.

## Fix a defect: reduce, then candidates, then restructure

Work in three phases: first remove the cause, then try candidate fixes in parallel, then restructure if it still
overlaps. Do not jump to candidates: an overlap is often a symptom of too many arrows, and the cheapest fix is not
drawing the offending one at all.

### Reduce first

Before generating any candidate, question the arrow that causes the problem. Most crossings come from
over-connecting (the budget in [GUIDE.md](../GUIDE.md)). For the offending connector, in this order:

- **Can it merge with another arrow?** If it and a sibling share a source or a target, or both cross the same lane to
  reach members of one group, make them one connector. Several arrows into members of one `<Group>` become a single
  arrow to the group (`to="groupId"`, [arrows.md](arrows.md)); that usually removes the crossing outright.
- **Give the merged connector one label** that says what the several arrows used to say.
- **Can it go entirely?** A response, echo or callback arrow, or a link to a cross-cutting service (logging, KMS,
  secrets) drawn from every node, can usually be dropped: the layout already says it.

If reducing removes the overlap you are done. Only a necessary arrow that still overlaps moves on to candidates.

### Force faces before offsetting lanes

`fromSide`/`toSide` (for example `<Arrow fromSide="bottom" toSide="top">`) always works. Reach for it before trying to
shift a lane sideways, because:

- **`Spacer` is square.** A `<Spacer size={232}/>` used to push a lane sideways also adds 232 px of height, the usual
  cause of a mysterious empty band under a row.
- **`Node` has no width.** Width comes from the caption, so one long official name ("AWS Identity and Access
  Management") makes column alignment by offsets impossible.
- **Offsetting is a moving target.** A taller stack re-centres its parent, so both ends shift. Measure each candidate
  instead of estimating: for one egress fan, an offset of 200 left the line 40 px out, 240 put it 24 px the other way,
  and only 280 landed it.

### Parallel candidate fixes

Each look costs time and an image, so emit several candidate fixes at once, render them in a batch, triage by report,
and look only at the clean survivors.

**Locate and diagnose.** Run `list` to find the editIds involved; the render report names the overlapping pair. Form
two to four distinct hypotheses: widen or scale a container edge, raise a `gap`, switch a stack's axis, nudge a node,
force an arrow's `fromSide`/`toSide` or `elbow`, or move the elbow's turn with `riser`. Two cases have a standard
sweep:

- **A messy elbow** (wandering, crossing another line, running along a group border): sweep `riser`. Emit the same
  arrow at a few values and pick the cleanest route by eye; a fraction between 0 and 1 places the turn between source
  and target, an absolute coordinate lifts it clear of a border ([scene-api.md](scene-api.md)).
- **An arrow cutting through a group** (a long connector slicing a container it does not belong to): sweep the top and
  bottom face combinations (`bottom` to `bottom`, `top` to `top`, `bottom` to `top`, `top` to `bottom`) against the
  default, and keep the one whose line stays outside every group.

**Emit each candidate to its own file**, in the same folder as the scene so its relative imports still resolve (a
candidate written anywhere else cannot render). The original stays untouched:

```bash
npm run edit-cli -- scenes/fig.tsx scale e2 right 16  --out scenes/cand_a.tsx
npm run edit-cli -- scenes/fig.tsx set e2 gap 40      --out scenes/cand_b.tsx
npm run edit-cli -- scenes/fig.tsx set e2 layout col  --out scenes/cand_c.tsx
npm run edit-cli -- scenes/fig.tsx set e9 toSide left --out scenes/cand_d.tsx
npm run edit-cli -- scenes/fig.tsx set e9 riser 0.3   --out scenes/cand_e.tsx
npm run edit-cli -- scenes/fig.tsx set e9 riser 0.75  --out scenes/cand_f.tsx
npm run edit-cli -- scenes/fig.tsx set e9 riser 776   --out scenes/cand_g.tsx
npm run edit-cli -- scenes/fig.tsx set-props e9 fromSide=bottom toSide=bottom --out scenes/cand_h.tsx
npm run edit-cli -- scenes/fig.tsx set-props e9 fromSide=top toSide=top       --out scenes/cand_i.tsx
npm run edit-cli -- scenes/fig.tsx set-props e9 fromSide=bottom toSide=top    --out scenes/cand_j.tsx
```

`cand_d` reroutes the offending arrow, `cand_e` and `cand_f` move its turn nearer the source or the target, `cand_g`
lifts the crossbar off a border with an absolute coordinate, and `cand_h` to `cand_j` send it under both groups, over
both, or under then over (`set-props` changes both faces in one edit). The candidates are independent, so they can be
generated in parallel, one subagent per candidate when there are many.

**Render all candidates in one batch and read the reports:**

```bash
for c in cand_a cand_b cand_c cand_d; do echo "== $c =="; node scripts/edit-cli.ts scenes/$c.tsx render; done
```

Each render writes the candidate's `.svg` and `.drawio` and prints one line: `clean`, or `⚠ N issue(s):` with the
`overlaps`, `labels`, `clipped` and `misaligned` counts, then the aspect. Add `--json` for the whole report object to
triage in a script; never add `--quiet`, which hides that line. **Discard the flagged candidates without looking.**
The report is only a filter, so:

**Look at the clean survivors.** Export each one (`node scripts/svg-to-png.ts scenes/cand_x.svg /tmp/cand_x.png
--look`) and Read it, or use the optional `render --view`. Confirm by eye that arrows, routes and labels are really
right, and pick the most compact, legible one.

**Apply the winner to the real file, look once more, and clean up:**

```bash
npm run edit-cli -- scenes/fig.tsx scale e2 right 16 --in-place --render
node scripts/svg-to-png.ts scenes/fig.svg /tmp/fig.png --look      # Read it and look once more
rm -f scenes/cand_*
```

N sequential fix, render and look cycles become one parallel emit, one batch render and a few looks. The original file
is not touched until the winner is applied, so a bad candidate costs nothing. When many candidates or scenes are in
play, fan the renders out to subagents and have each report only defects.

### Restructure when the winner still overlaps

If even the best candidate still overlaps, or trades one crossing for another, stop nudging props: the problem is
structural. Change the layout and the logical positions, not the arrow geometry:

- **Re-order the layout.** Swap a `<VStack>` for an `<HStack>` (or the reverse), change a Grid's `cols`, or reorder
  siblings so connected components sit next to each other and the main flow runs one way. Two nodes that must connect
  should be neighbours; most crossings come from connected components far apart with something between them.
- **Move a group to where its arrows come from.** Put a container beside the tier that feeds it (a support group like
  "Security & Config" belongs next to whatever uses it, not across the canvas), so a long cross-canvas connector becomes
  a short adjacent one.
- **Simplify the relationships.** Go back to reducing with fresh eyes: are there still more arrows than nodes? Merge
  more links, lift more flows to the group level, cut the remaining response and echo arrows. A figure that will not
  lay out cleanly is usually still over-connected.

An overlap that survives a full candidate sweep is saying the composition is wrong, not the arrow's side. After
restructuring, start this review again from the top.
