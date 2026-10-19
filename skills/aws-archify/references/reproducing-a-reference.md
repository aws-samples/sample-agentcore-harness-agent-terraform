# Reproducing a reference image

Read this when the ask is "make *this* diagram" and you were given an image to match. For a fresh design use
[composition.md](composition.md) instead.

Study the reference as a map before drawing: its components, how they nest, which floating actors sit outside, and
how the long arrows route. Fidelity to its composition beats your own taste here: match its positions, nesting and
arrow routing. That is what the absolute escape hatch is for: give components explicit `x`/`y` (multiples of 8) read
off the reference, inside a `<Free>` or a `<Diagram layout="free">`, and draw arrows with `from`/`to` (plus `via`) or
by hand with `points` and `edges()` ([scene-api.md](scene-api.md)).

## Build it one element per checkpoint

The same loop as any figure: add one thing, render, look.

- **The container tree first, roughly.** Nest the `<Group>`s the way the reference nests its components, each placed
  with an `x`/`y` taken from the reference.
- **Then each component's nodes**, one per checkpoint. A component placed absolutely can still use a stack or grid
  inside it for alignment.
- **Floating actors** (users outside the cloud, a loose SDK or configuration) get their own `x`/`y`.
- **Arrows one at a time.** `from`/`to` attach cleanly; `via` or `points` carry a long connector that has to dodge
  components. A `points` arrow cannot carry a label, so when a hand-routed connector needs one, route it through an
  `<Anchor>` with two id-attached legs instead. If the reference numbers its steps, put each step on its arrow as a
  short label: figures never use numbered badges ([arrows.md](arrows.md)).
- **Overlay against the reference** and iterate.

## Overlay to confirm the match

The bar is a visual layout match. You need a raster of your own SVG to set beside the reference: it is a scratch file
for the comparison, and the `.svg` stays the deliverable.

```bash
npm run render  -- scenes/mine.tsx --no-check                 # the deliverable SVG
node scripts/svg-to-png.ts scenes/mine.svg /tmp/mine.png --look   # throwaway raster for the comparison
npm run overlay -- reference.png /tmp/mine.png /tmp/compare.png   # then Read /tmp/compare.png
npm run match   -- reference.png /tmp/mine.png                    # a supporting number only
```

`overlay` scales both images to one width (1200 px unless `--width N`), stacks the reference on top of yours with a
28 px gap, writes the result and prints a six-point rubric: component placement, nesting, node positions, numbered
steps, connector routing and framing. Judge `compare.png` region by region against it, and iterate until a viewer would
take yours for the reference at a glance, with only cosmetic differences (palette, label wrapping, a few pixels of
routing). The rubric's step item comes from numbered references: in your scene each step is an arrow label, so check
that every step has its label on the same arrow, pointing the same way.

The stacked image is as tall as both figures together, which can pass the 2000 px limit on images you Read. For tall
figures pass a smaller `--width` (800, say), or cut a band out with `node scripts/crop-png.ts compare.png band.png
<top> <height>`, which scales the band to 980 px wide.

`match` finds landmarks in both images (dark step discs and saturated icon tiles), normalises each set to its own
content box, and reports how many of the reference's landmarks have a counterpart within `--tol` (0.08 by default;
`--json` prints the full result). It is deliberately strict and under-reports: moderate drift, different proportions,
wrapped labels or palette differences break the tolerance, and icon interiors can be misdetected. A high score is
strong evidence of a match, a low one does not prove a mismatch. Your eyes on the overlay are the arbiter.

## Study the worked examples first

`assets/examples/` holds complete, visually checked architectures with their rendered SVGs, from the small
`serverless-api` starter (self-contained, with the real icons embedded and no external references: the quality to aim
for) to large multi-tier designs. [assets/examples/README.md](../assets/examples/README.md) says what each one teaches.
Between them they show how to keep a large figure clean: place connected components next to each other, lay each
concern's pipeline out as one straight row or column, and use `fromSide`/`toSide` for a hub's fan-out. They are the
bar for a complex figure.
