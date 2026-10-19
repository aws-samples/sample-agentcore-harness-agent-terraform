# Changing the engine: the regression gate

Read this only when you change the engine (`src/engine.tsx` and the modules under `src/engine/`) or anything else that
changes rendered output. Drawing figures never touches the engine.

<STRICT_REQUIREMENT>
**Whenever you change the core rendering engine (layout, routing, arrowheads, group chrome, measurement, anything that
affects output) you MUST re-render ALL bundled examples and review them VISUALLY before the change is done.** Every
diagram shares the engine, and a change that looks right on one scene routinely breaks another: a reroute that now
clips a label, an arrowhead malformed only at a tight turn, a group that stops hugging. A green typecheck and a clean
layout report do **not** prove the pictures are still right.

After any engine edit, run in this order:

```bash
npm run typecheck        # the types still hold
npm run examples         # re-render every assets/examples/*.svg (add -- --view to screenshot through agent-browser)
```

`npm run examples` rebuilds every example SVG with the current engine and prints one line per scene, flagging any that
now overlap, clip, misalign or fail to render. To look, export each one with
`node scripts/svg-to-png.ts assets/examples/<name>.svg /tmp/<name>.png --look`; with the optional `--view` it
screenshots them into a temp folder instead and prints the folder.

**Look at every PNG** (Read each one). The report filters; it is not the gate. For every example confirm by eye that
each arrowhead is clean and points the right way at its target edge, that connectors route sensibly (no line through
an icon or a label, no pointless detour), that nothing overlaps or clips, and that no arrow label sits on a group
border or a key element. With many examples in play, fan the looking out to subagents, one batch each, so the images
do not flood your context, and have each report only defects.

**Triage every flag.** For anything the report flags or your eye catches, decide whether your change caused it or it was
already there: render the same scene with the previous engine and compare. The engine spans many files, so export the
earlier commit's whole skill folder into a temp folder from the repository root (`git archive <commit>
skills/aws-archify | tar -x -C <tmp>`), link `node_modules` into
`<tmp>/skills/aws-archify`, and render the scene there. Fix real regressions before committing. A
pre-existing advisory may stay, but say so.

**Commit the regenerated example SVGs together with the engine change.** They are the visible contract of the
engine's output: a reviewer sees exactly what your change did to every figure. Never leave them stale.

An engine change whose examples you have not re-rendered and looked at is UNVERIFIED and NOT done, the same bar as a
single figure.
</STRICT_REQUIREMENT>

## The baseline

Know what a passing run looks like before you change anything, or you cannot tell your regression from a flag that
was already there. At the current commit:

```
30 example(s): 30 clean, 0 flagged, 0 failed.
```

Every example also passes both check scripts: `scripts/check-paths.ts` finds no intersection, and
`scripts/check-layout.ts` reports 0 hard defects and 0 must-fix items (it exits 0 even without `--advisory`).
The advisories the examples still carry are listed, with the reasons, in
[assets/examples/README.md](../assets/examples/README.md). Anything worse than this baseline is yours to fix or revert.

```bash
for f in assets/examples/*.svg; do echo "$f"; node scripts/check-paths.ts "$f" | tail -1; node scripts/check-layout.ts "$f" | tail -1; done
```

## The canary scenes

Two examples exist to guard the engine, not as patterns to copy:

- **`canary-primitives.tsx`** exercises the escape hatches the architectures barely use: `layout="free"` and `<Free>`
  with `x`/`y`, `<Icon>`, a start-anchored `<Label>`, `<Rect>`, `<Raw>`, `<ZStack>`, `<Spacer>`, `<Move>`,
  `<Anchor>`, `points` with `edges()`, `via` and `riser`. If you change absolute placement or manual routing, this is
  the scene whose `.svg` diff proves it. Its `<Move>` wraps two tiles (Amazon CloudWatch and AWS X-Ray), so it also
  guards the rule that a Move keeps its children's relative layout (they stay side by side, nudged together) instead
  of stacking them on one point. Its `<Label>` and its boundary `<Rect>` sit on the canvas's left margin, so it guards
  the fitted canvas measuring an anchored label and a hand-drawn rectangle, and the rule that a Label's glyphs stay
  inside the box measured for it, whatever its anchor. It renders clean: keep it that way.
- **`canary-nested-group-snap.tsx`** guards the grid snap for a `<Group>` that inherits a half-grid offset from an
  `<HStack>` inside a `<VStack>` (a caption wider than the box below it). That combination used to make the
  layout's grid verification throw; a Group's absolute origin is now snapped when it is placed, so the scene renders
  clean. Keep all three of its tiers: two trip the off-grid offset (36 and 12 px) and the third is an on-grid control
  that catches an over-eager snap moving a box that was already right.

Compare the re-rendered SVGs with git, and read both commands, because `git diff` speaks only for tracked files and a
newly added `.svg` shows up only in `git status`:

```bash
git diff --stat -- 'assets/examples/*.svg'     # changed renders
git status --porcelain assets/examples/        # and any new or untracked ones
```

## What the gate does not cover

A change in any of these is invisible to `npm run examples`; test it with a scratch scene of its own.

- **`<StepBadge>`.** 16 of the 17 element tags appear in at least one example; `<StepBadge>` (like
  `<Diagram steps>`) appears in none, since it only throws now that figures are never numbered.
- **Tags and hatches with one user.** `<Free>`, `<Icon>`, `<Label>` and `<Raw>`, and the `via` and `edges()` hatches,
  appear in `canary-primitives.tsx` only, and `<Grid>` only in `serverless-web-app.tsx`: break one and that single
  `.svg` is your whole signal. (`points` has two users, the canary and `org-ou-tree.tsx`; the other hatches have
  more: `<Rect>` in 20 scenes, `<ZStack>` in 17, `<Spacer>` in 9, `<Anchor>` in 9, `<Move>` in 5.)
- **Layout values.** `layout="zstack"` appears nowhere; `layout="grid"` only on one Group (in `ai-native-trading`,
  with `cols`), so the missing-`cols` error is never hit, and neither is the unknown-`layout` error.
- **5 of the 18 group kinds**: `service-purple`, `service-green`, `service-orange`, `service-red` and
  `service-magenta`. Their chrome is untested.
- **Props**: `<Label anchor="end">` (only `start` and the default `middle` are used), a Label's `chip` and `bold`,
  `elbow={false}`, `poster`. `padTop` has one user.
- **Animation.** No example animates, so the animated copy, its styles, the rule that it is written only when an
  arrow moves, and draw.io's `flowAnimation` go unchecked.
- **Options.** The gate renders every scene with no options, so the fixed-canvas path (`--canvas WxH`; a scene in a
  fixed canvas is not fitted and its top-left icon clips by design), rendering with the icon check off (the
  editor's live view) and `allowEmpty` are never exercised.
- **Guards with no example.** Two arrow colours that reduce to one marker slug (`#abc` and `abc`), a `riser` on a
  U-turn whose ends share a row or column, a group title colliding with other text (the gate shows only that titles
  raise no false alarm: all 30 stay clean), the empty-scene error and the missing-badge error. The per-copy icon id
  prefix is covered: five examples draw an icon with its own clip path, `bedrock-agentcore-agent` one icon five times.
- **The `.drawio` file.** The gate writes SVGs only. The draw.io model is still covered through the `content`
  attribute every SVG carries.

## When the icons change

Regenerating `src/icons/` from a new icon release is described in [icon-catalog.md](icon-catalog.md). Run this gate
afterwards: every example embeds the icons it uses.
